import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ulid } from 'ulid';
import {
  ExclusaoPisCofinsCalculationResponse,
  ExclusaoPisCofinsStatus,
  TaxCalculationType,
} from 'src/model/tax-calculations.model';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { stream } from 'exceljs';
import { Readable } from 'stream';

@Injectable()
export class TaxCalculationsService {
  constructor() { }

  clientConfig = {
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  };

  private readonly logger = new Logger(TaxCalculationsService.name);

  private async convertXlsxToCsvStream(
    file: Express.Multer.File,
    delimiter: string = ',',
  ): Promise<{ csv: string; cnpj: string }> {
    const bufferStream = Readable.from(file.buffer);
    const workbookReader = new stream.xlsx.WorkbookReader(bufferStream, {
      sharedStrings: 'cache',
    });

    const csvLines: string[] = [];
    let cnpj = '';
    let rowCount = 0;
    let processed = false;

    for await (const worksheet of workbookReader) {
      if (processed) break;

      for await (const row of worksheet) {
        rowCount++;
        const values = (row.values as any[]).slice(1);

        const csvRow = values.map((val: any) => {
          if (val == null || val === '') return '';
          const strVal = String(val).trim();
          if (
            strVal.includes(delimiter) ||
            strVal.includes('"') ||
            strVal.includes('\n') ||
            strVal.includes('\r')
          ) {
            return `"${strVal.replace(/"/g, '""')}"`;
          }

          return strVal;
        });

        csvLines.push(csvRow.join(delimiter));

        if (rowCount === 2) {
          cnpj = String(values[0] ?? '').trim();
        }
      }

      processed = true;
      break;
    }

    if (csvLines.length === 0) {
      throw new Error('Nenhuma linha encontrada na planilha');
    }

    return {
      csv: csvLines.join('\n'),
      cnpj,
    };
  }

  async startExclusaoPisCofinsJob(
    userId: string,
    files: Express.Multer.File[],
  ): Promise<ExclusaoPisCofinsCalculationResponse> {
    this.logger.log(
      `Received ${files.length} file(s): ${files.map((f) => f.originalname).join(', ')}`,
    );
    const dynamoDBClient = new DynamoDBClient(this.clientConfig);
    const s3Client = new S3Client(this.clientConfig);

    try {
      const calculationId = ulid();
      const createdAt = new Date().toISOString();
      const status = ExclusaoPisCofinsStatus.Pending;

      const fileData: Array<{ filename: string; size: number }> = [];
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);

      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        this.logger.log(`Uploading file ${index + 1}/${files.length}: ${file.originalname}`);

        const s3Command = new PutObjectCommand({
          Bucket: 'ez-tax',
          Key: `exclusao-pis-cofins/${userId}/${calculationId}/files/${index + 1}_${file.originalname}`,
          Body: file.buffer,
          ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

        await s3Client.send(s3Command);
        fileData.push({
          filename: file.originalname,
          size: file.size,
        });
      }

      const dynamoDBCommand = new PutCommand({
        TableName: 'tax-calculations',
        Item: {
          userId,
          calculationId,
          name: 'exclusao-pis-cofins',
          fileCount: files.length,
          totalFileSize: totalSize,
          files: fileData,
          status,
          createdAt,
        },
      });

      await dynamoDBClient.send(dynamoDBCommand);

      this.logger.log(`Record and ${files.length} file(s) saved for: ${calculationId}`);

      return {
        calculationId,
        status,
        createdAt,
        type: TaxCalculationType.ExclusaoPisCofins,
      };
    } catch (error) {
      this.logger.error(`Error: ${error}`);
      throw new InternalServerErrorException(
        'Failed to start exclusao-pis-cofins job',
      );
    }
  }

  async getJobs(
    userId: string,
  ): Promise<ExclusaoPisCofinsCalculationResponse[]> {
    const dynamoDBClient = new DynamoDBClient(this.clientConfig);
    try {
      const params = {
        TableName: 'tax-calculations',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': { S: userId },
        },
      };
      const data = await dynamoDBClient.send(new QueryCommand(params));
      return (data.Items || []).map((item) => ({
        calculationId: item.calculationId.S!,
        status: item.status.S! as ExclusaoPisCofinsStatus,
        createdAt: item.createdAt.S!,
        updatedAt: item.updatedAt ? item.updatedAt.S : undefined,
        pdfUrl: item.pdfUrl ? item.pdfUrl.S : undefined,
        fileSize: item.fileSize ? parseInt(item.fileSize.N!) : undefined,
        cnpj: item.cnpj ? item.cnpj.S : undefined,
        type: TaxCalculationType.ExclusaoPisCofins,
      }));
    } catch (error) {
      this.logger.error(`Error fetching jobs for user ${userId}: ${error}`);
      throw new InternalServerErrorException('Failed to fetch jobs');
    }
  }

  async downloadJobResult(
    userId: string,
    calculationId: string,
  ): Promise<{ url: string; fileSize?: number }> {
    this.logger.log(
      `Received download request for calculation ${calculationId}`,
    );

    const s3Client = new S3Client(this.clientConfig);
    const dynamoDBClient = new DynamoDBClient(this.clientConfig);
    try {
      const params = {
        TableName: 'tax-calculations',
        KeyConditionExpression:
          'userId = :userId AND calculationId = :calculationId',
        ExpressionAttributeValues: {
          ':userId': { S: userId },
          ':calculationId': { S: calculationId },
        },
      };
      const data = await dynamoDBClient.send(new QueryCommand(params));
      const item = data.Items?.[0];

      if (!item) {
        throw new NotFoundException('Calculation not found');
      }

      const command = new GetObjectCommand({
        Bucket: 'ez-tax',
        Key: `exclusao-pis-cofins/${userId}/${calculationId}/${item.cnpj.S!}.pdf`,
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      return {
        url,
        fileSize: item.fileSize ? parseInt(item.fileSize.N!) : undefined,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching result for user ${userId} and calculation ${calculationId}: ${error}`,
      );
      throw new InternalServerErrorException('Failed to fetch result');
    }
  }
}
