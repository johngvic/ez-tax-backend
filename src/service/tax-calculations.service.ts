import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ulid } from 'ulid';
import {
  TaxCalculation,
  TaxCalculationResponse,
  TaxCalculationStatus,
  TaxCalculationType,
  ReviewedCalculation,
} from 'src/model/tax-calculations.model';
import { PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import {
  PutObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream } from 'fs';
import {
  DynamoDBClient,
  QueryCommand,
  QueryCommandInput,
} from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { requireEnv } from 'src/common/config/env';

function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${unit === 0 ? size : size.toFixed(1)} ${units[unit]}`;
}

@Injectable()
export class TaxCalculationsService {
  constructor() { }

  clientConfig = {
    region: process.env.AWS_REGION,
  };

  private readonly bucketName = requireEnv('S3_BUCKET_NAME');
  private readonly tableName = requireEnv('DYNAMODB_TABLE_NAME');

  private readonly logger = new Logger(TaxCalculationsService.name);

  private static readonly UPLOAD_PART_SIZE = 16 * 1024 * 1024;

  async runTaxCalculation(
    userId: string,
    file: Express.Multer.File,
    styled: boolean,
    calculationType: TaxCalculationType
  ): Promise<TaxCalculation> {
    this.logger.log(`Received file ${file.originalname} (${formatFileSize(file.size)})`);
    const dynamoDBClient = new DynamoDBClient(this.clientConfig);
    const s3Client = new S3Client(this.clientConfig);

    try {
      const calculationId = ulid();
      const createdAt = new Date().toISOString();
      const status = TaxCalculationStatus.Pending;

      // multipart: envia em partes com retry por parte e aceita arquivos acima de 5GB (limite do PutObject)
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: this.bucketName,
          Key: `${calculationType}/${userId}/${calculationId}/input.xlsx`,
          Body: createReadStream(file.path),
          ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        partSize: TaxCalculationsService.UPLOAD_PART_SIZE,
        queueSize: 4,
      });
      await upload.done();

      // o registro só é criado depois do upload completo, então o cálculo nunca começa sem o arquivo
      const dynamoDBCommand = new PutCommand({
        TableName: this.tableName,
        Item: {
          userId,
          calculationId,
          name: calculationType,
          fileName: file.originalname,
          fileSize: file.size,
          styled,
          status,
          createdAt,
        },
      });

      await dynamoDBClient.send(dynamoDBCommand);

      this.logger.log(`Record and file saved for: ${calculationId}`);

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
    calculationId?: string,
    cnpj?: string,
    calculationType?: TaxCalculationType,
    status?: TaxCalculationStatus,
  ): Promise<TaxCalculationResponse> {
    const dynamoDBClient = new DynamoDBClient(this.clientConfig);
    try {
      let keyConditionExpression = 'userId = :userId';
      const expressionAttributeValues: Record<string, { S: string }> = {
        ':userId': { S: userId },
      };
      const expressionAttributeNames: Record<string, string> = {};
      const filterExpressions: string[] = [];

      if (calculationId) {
        keyConditionExpression += ' AND calculationId = :calculationId';
        expressionAttributeValues[':calculationId'] = { S: calculationId };
      }

      if (cnpj) {
        filterExpressions.push('cnpj = :cnpj');
        expressionAttributeValues[':cnpj'] = { S: cnpj };
      }

      if (calculationType) {
        filterExpressions.push('#name = :calculationType');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':calculationType'] = { S: calculationType };
      }

      if (status) {
        filterExpressions.push('#status = :status');
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = { S: status };
      }

      const params: QueryCommandInput = {
        TableName: this.tableName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: limit,
        ScanIndexForward: false,
      };

      if (filterExpressions.length > 0) {
        params.FilterExpression = filterExpressions.join(' AND ');
      }

      if (Object.keys(expressionAttributeNames).length > 0) {
        params.ExpressionAttributeNames = expressionAttributeNames;
      }

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
        errorReason: item.errorReason ? item.errorReason.S : undefined,
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
        TableName: this.tableName,
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
        Bucket: this.bucketName,
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
        TableName: this.tableName,
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
        errorReason: item.errorReason ? item.errorReason.S : undefined,
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

  async deleteTaxCalculation(
    userId: string,
    calculationId: string,
  ): Promise<{ calculationId: string; message: string }> {
    this.logger.log(
      `Deleting calculation ${calculationId} for user ${userId}`,
    );

    const dynamoDBClient = new DynamoDBClient(this.clientConfig);
    const s3Client = new S3Client(this.clientConfig);

    try {
      const params = {
        TableName: this.tableName,
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

      const calculationType = item.name.S! as TaxCalculationType;
      const prefix = `${calculationType}/${userId}/${calculationId}/`;

      let continuationToken: string | undefined;
      do {
        const listResult = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );

        const objects = listResult.Contents ?? [];
        if (objects.length > 0) {
          await s3Client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucketName,
              Delete: {
                Objects: objects.map((obj) => ({ Key: obj.Key! })),
              },
            }),
          );
        }

        continuationToken = listResult.IsTruncated
          ? listResult.NextContinuationToken
          : undefined;
      } while (continuationToken);

      await dynamoDBClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { userId, calculationId },
        }),
      );

      this.logger.log(
        `Calculation ${calculationId} deleted for user ${userId}`,
      );

      return {
        calculationId,
        message: 'Calculation deleted successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Error deleting calculation ${calculationId} for user ${userId}: ${error}`,
      );
      throw new InternalServerErrorException('Failed to delete calculation');
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

    const queueUrl = process.env.SQS_GENERATE_PDF_REPORT_QUEUE_URL;
    if (!queueUrl) {
      throw new InternalServerErrorException(
        'PDF generation queue is not configured',
      );
    }

    const reviewedKey = `${calculationType}/${userId}/${calculationId}/reviewed.json`;

    // trava atômica: só aceita refinamento (WAITING_REVIEW) ou edição de um cálculo concluído (COMPLETED).
    // Em processamento/falha, ou com dois envios simultâneos, a condição falha e nada é gravado
    const previousStatus = await this.lockCalculationForRefinement(dynamoDBClient, userId, calculationId);

    try {
      // edição: guarda o refinamento anterior antes de sobrescrever (se a regeração falhar, nada se perde)
      if (previousStatus === TaxCalculationStatus.Completed) {
        await this.backupReviewedCalculation(s3Client, reviewedKey, `${calculationType}/${userId}/${calculationId}`);
      }

      await s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: reviewedKey,
          Body: JSON.stringify(reviewedCalculation),
          ContentType: 'application/json',
        }),
      );

      // a lambda de relatório gera o PDF a partir do reportTable da mensagem (sobrescrevendo o anterior, na edição)
      // e marca o cálculo como COMPLETED
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            userId,
            calculationId,
            calculationType,
            result: reviewedCalculation.reportTable,
            styled,
            cnpj,
          }),
        }),
      );

      this.logger.log(
        `Reviewed calculation saved and PDF generation queued for ${calculationId} (${previousStatus === TaxCalculationStatus.Completed ? 'edit' : 'refinement'})`,
      );

      return {
        calculationId,
        message: 'Calculation refinement submitted successfully',
      };
    } catch (error) {
      // nada foi enfileirado: devolve o status anterior para o cálculo não ficar preso em PROCESSING
      await this.restoreCalculationStatus(dynamoDBClient, userId, calculationId, previousStatus);

      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }

      this.logger.error(
        `Error saving reviewed calculation for user ${userId} and calculation ${calculationId}: ${error}`,
      );
      throw new InternalServerErrorException('Failed to save calculation refinements');
    }
  }

  private static readonly REFINABLE_STATUSES = [TaxCalculationStatus.WaitingReview, TaxCalculationStatus.Completed];

  /** Marca o cálculo como PROCESSING se ele estiver em um status refinável e devolve o status anterior. */
  private async lockCalculationForRefinement(
    dynamoDBClient: DynamoDBClient,
    userId: string,
    calculationId: string,
  ): Promise<TaxCalculationStatus> {
    try {
      const result = await dynamoDBClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { userId, calculationId },
          UpdateExpression: 'SET #status = :processing, updatedAt = :updatedAt',
          ConditionExpression: 'attribute_exists(calculationId) AND #status IN (:waitingReview, :completed)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':processing': TaxCalculationStatus.Processing,
            ':waitingReview': TaxCalculationStatus.WaitingReview,
            ':completed': TaxCalculationStatus.Completed,
            ':updatedAt': new Date().toISOString(),
          },
          ReturnValues: 'ALL_OLD',
        }),
      );
      return result.Attributes?.status as TaxCalculationStatus;
    } catch (error) {
      if ((error as { name?: string })?.name !== 'ConditionalCheckFailedException') throw error;

      const current = await this.getTaxCalculation(userId, calculationId);
      if (current.status === TaxCalculationStatus.Processing) {
        throw new ConflictException('Calculation is already being processed');
      }
      throw new ConflictException(
        `Calculation cannot be refined in status ${current.status}; expected ${TaxCalculationsService.REFINABLE_STATUSES.join(' or ')}`,
      );
    }
  }

  private async restoreCalculationStatus(
    dynamoDBClient: DynamoDBClient,
    userId: string,
    calculationId: string,
    status: TaxCalculationStatus,
  ): Promise<void> {
    try {
      await dynamoDBClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { userId, calculationId },
          UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status, ':updatedAt': new Date().toISOString() },
        }),
      );
    } catch (error) {
      this.logger.error(`Failed to restore status ${status} for calculation ${calculationId}: ${error}`);
    }
  }

  /** Copia o reviewed.json atual para reviewed-history/{timestamp}.json antes de uma edição sobrescrevê-lo. */
  private async backupReviewedCalculation(s3Client: S3Client, reviewedKey: string, calculationPrefix: string): Promise<void> {
    try {
      await s3Client.send(
        new CopyObjectCommand({
          Bucket: this.bucketName,
          CopySource: `${this.bucketName}/${encodeURIComponent(reviewedKey).replace(/%2F/g, '/')}`,
          Key: `${calculationPrefix}/reviewed-history/${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        }),
      );
    } catch (error) {
      // sem refinamento anterior salvo não há o que guardar
      if ((error as { name?: string })?.name === 'NoSuchKey') return;
      throw error;
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
        Bucket: this.bucketName,
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

  async getRefinementAudit(
    userId: string,
    calculationId: string,
    calculationType: TaxCalculationType,
  ): Promise<ReviewedCalculation> {
    this.logger.log(
      `Received refinement audit request for calculation ${calculationId}`,
    );

    const s3Client = new S3Client(this.clientConfig);
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: `${calculationType}/${userId}/${calculationId}/reviewed.json`,
      });

      const response = await s3Client.send(command);
      const body = await response.Body?.transformToString();

      if (!body) {
        throw new NotFoundException('Refinement file not found');
      }

      return JSON.parse(body);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if ((error as { name?: string })?.name === 'NoSuchKey') {
        throw new NotFoundException('Refinement file not found');
      }

      this.logger.error(
        `Error fetching refinement audit for user ${userId} and calculation ${calculationId}: ${error}`,
      );
      throw new InternalServerErrorException('Failed to fetch refinement audit');
    }
  }
}
