import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ulid } from 'ulid';
import {
  TaxCalculation,
  TaxCalculationResponse,
  TaxCalculationStatus,
  TaxCalculationType,
  ReviewedCalculation,
} from 'src/model/tax-calculations.model';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  DynamoDBClient,
  QueryCommand,
  QueryCommandInput,
} from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

@Injectable()
export class TaxCalculationsService {
  constructor() { }

  clientConfig = {
    region: process.env.AWS_REGION,
  };

  private readonly logger = new Logger(TaxCalculationsService.name);

  async runTaxCalculation(
    userId: string,
    files: Express.Multer.File[],
    styled: boolean,
    calculationType: TaxCalculationType
  ): Promise<TaxCalculation> {
    this.logger.log(
      `Received ${files.length} file(s): ${files.map((f) => f.originalname).join(', ')}`,
    );
    const dynamoDBClient = new DynamoDBClient(this.clientConfig);
    const s3Client = new S3Client(this.clientConfig);

    try {
      const calculationId = ulid();
      const createdAt = new Date().toISOString();
      const status = TaxCalculationStatus.Pending;
      
      const fileData: Array<{ filename: string; size: number }> = [];
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);

      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        this.logger.log(`Uploading file ${index + 1}/${files.length}: ${file.originalname}`);

        const s3Command = new PutObjectCommand({
          Bucket: 'ez-tax',
          Key: `${calculationType}/${userId}/${calculationId}/files/${index + 1}_${file.originalname}`,
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
          name: calculationType,
          fileCount: files.length,
          fileSize: totalSize,
          styled,
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
        calculationType
      };
    } catch (error) {
      this.logger.error(`Error: ${error}`);
      throw new InternalServerErrorException(
        'Failed to start tax calculation',
      );
    }
  }

  async getTaxCalculations(
    userId: string,
    limit: number = 10,
    exclusiveStartKey?: string,
  ): Promise<TaxCalculationResponse> {
    const dynamoDBClient = new DynamoDBClient(this.clientConfig);
    try {
      const params: QueryCommandInput = {
        TableName: 'tax-calculations',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': { S: userId },
        },
        Limit: limit,
        ScanIndexForward: false,
      };

      if (exclusiveStartKey) {
        try {
          params['ExclusiveStartKey'] = JSON.parse(exclusiveStartKey);
        } catch {
          throw new BadRequestException('Invalid exclusiveStartKey');
        }
      }

      const result = await dynamoDBClient.send(new QueryCommand(params));
      const items = (result.Items || []).map((item) => ({
        calculationId: item.calculationId.S!,
        status: item.status.S! as TaxCalculationStatus,
        createdAt: item.createdAt.S!,
        updatedAt: item.updatedAt ? item.updatedAt.S : undefined,
        pdfUrl: item.pdfUrl ? item.pdfUrl.S : undefined,
        fileSize: item.fileSize ? parseInt(item.fileSize.N!) : undefined,
        cnpj: item.cnpj ? item.cnpj.S : undefined,
        calculationType: item.name.S! as TaxCalculationType,
      }));

      return {
        data: items,
        nextCursor: result.LastEvaluatedKey ? JSON.stringify(result.LastEvaluatedKey) : undefined,
        hasNext: !!result.LastEvaluatedKey,
      }
    } catch (error) {
      this.logger.error(`Error fetching jobs for user ${userId}: ${error}`);
      throw new InternalServerErrorException('Failed to fetch tax calculations');
    }
  }

  async downloadTaxCalculation(
    userId: string,
    calculationId: string,
    calculationType: TaxCalculationType
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
        Key: `${calculationType}/${userId}/${calculationId}/${item.cnpj.S!}.pdf`,
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

  async getTaxCalculation(
    userId: string,
    calculationId: string,
  ): Promise<TaxCalculationResponse['data'][number]> {
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

      return {
        calculationId: item.calculationId.S!,
        status: item.status.S! as TaxCalculationStatus,
        createdAt: item.createdAt.S!,
        updatedAt: item.updatedAt ? item.updatedAt.S : undefined,
        pdfUrl: item.pdfUrl ? item.pdfUrl.S : undefined,
        fileSize: item.fileSize ? parseInt(item.fileSize.N!) : undefined,
        cnpj: item.cnpj ? item.cnpj.S : undefined,
        calculationType: item.name.S! as TaxCalculationType,
        styled: item.styled ? item.styled.BOOL : undefined
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Error fetching calculation ${calculationId} for user ${userId}: ${error}`,
      );
      throw new InternalServerErrorException('Failed to fetch calculation');
    }
  }

  async saveCalculationRefinements(
    userId: string,
    calculationId: string,
    calculationType: TaxCalculationType,
    reviewedCalculation: ReviewedCalculation,
    styled: boolean,
    cnpj: string,
  ): Promise<{ calculationId: string; message: string }> {
    this.logger.log(
      `Saving reviewed calculation for calculation ${calculationId}`,
    );

    if (!Array.isArray(reviewedCalculation?.reportTable)) {
      throw new BadRequestException('reportTable is required');
    }

    if (!cnpj) {
      throw new BadRequestException('cnpj is required');
    }

    const s3Client = new S3Client(this.clientConfig);
    const sqsClient = new SQSClient(this.clientConfig);
    const dynamoDBClient = new DynamoDBClient(this.clientConfig);

    try {
      const putCommand = new PutObjectCommand({
        Bucket: 'ez-tax',
        Key: `${calculationType}/${userId}/${calculationId}/reviewed.json`,
        Body: JSON.stringify(reviewedCalculation),
        ContentType: 'application/json',
      });

      await s3Client.send(putCommand);

      const queueUrl = process.env.SQS_GENERATE_PDF_REPORT_QUEUE_URL;
      if (!queueUrl) {
        throw new InternalServerErrorException(
          'PDF generation queue is not configured',
        );
      }

      const sendMessageCommand = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({
          userId,
          calculationId,
          calculationType,
          result: reviewedCalculation.reportTable,
          styled,
          cnpj,
        }),
      });

      await sqsClient.send(sendMessageCommand);

      await dynamoDBClient.send(
        new UpdateCommand({
          TableName: 'tax-calculations',
          Key: { userId, calculationId },
          UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': TaxCalculationStatus.Processing,
            ':updatedAt': new Date().toISOString(),
          },
        }),
      );

      this.logger.log(
        `Reviewed calculation saved and PDF generation queued for ${calculationId}`,
      );

      return {
        calculationId,
        message: 'Calculation refinement submitted successfully',
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }

      this.logger.error(
        `Error saving reviewed calculation for user ${userId} and calculation ${calculationId}: ${error}`,
      );
      throw new InternalServerErrorException('Failed to save calculation refinements');
    }
  }

  async getRawCalculation(
    userId: string,
    calculationId: string,
    calculationType: TaxCalculationType,
  ): Promise<unknown> {
    this.logger.log(
      `Received refinements request for calculation ${calculationId}`,
    );

    const s3Client = new S3Client(this.clientConfig);
    try {
      const command = new GetObjectCommand({
        Bucket: 'ez-tax',
        Key: `${calculationType}/${userId}/${calculationId}/calculation.json`,
      });

      const response = await s3Client.send(command);
      const body = await response.Body?.transformToString();

      if (!body) {
        throw new NotFoundException('Calculation file not found');
      }

      return JSON.parse(body);
    } catch (error)   {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Error fetching refinements for user ${userId} and calculation ${calculationId}: ${error}`,
      );
      throw new InternalServerErrorException('Failed to fetch calculation refinements');
    }
  }
}
