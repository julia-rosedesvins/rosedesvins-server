import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Check if it's our custom validation error format
    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'errors' in exceptionResponse
    ) {
      response.status(status).json({
        success: false,
        message: 'Validation failed',
        errors: (exceptionResponse as any).errors,
        statusCode: status,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Handle other BadRequestExceptions
      response.status(status).json({
        success: false,
        message: exceptionResponse || 'Bad Request',
        statusCode: status,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
