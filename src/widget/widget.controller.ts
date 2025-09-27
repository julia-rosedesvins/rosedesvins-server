import { Controller, Get, Query, UsePipes } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { WidgetService } from './widget.service';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { 
  WidgetDataQuerySchema, 
  WidgetDataQueryDto 
} from '../validators/widget.validators';

@ApiTags('Widget')
@Controller('widget')
export class WidgetController {
  constructor(private readonly widgetService: WidgetService) {}

  @Get('data')
  @ApiOperation({ 
    summary: 'Get widget data for user and service (Public endpoint)',
    description: 'Retrieves domain profile, availability, and payment methods for a specific user and service. Validates active subscription first.'
  })
  @ApiQuery({ 
    name: 'userId', 
    required: true, 
    type: String, 
    example: '60d0fe4f5311236168a109ca',
    description: 'User ID (MongoDB ObjectId)' 
  })
    @ApiQuery({ 
    name: 'serviceId', 
    required: true, 
    type: String, 
    example: '60d0fe4f5311236168a109cb',
    description: 'Service ID (MongoDB ObjectId from services array)' 
  })
  @UsePipes(new ZodValidationPipe(WidgetDataQuerySchema))
  async getWidgetData(@Query() query: WidgetDataQueryDto) {
    try {
      const data = await this.widgetService.getWidgetData(query);
      
      return {
        success: true,
        message: 'Widget data retrieved successfully',
        data,
      };
    } catch (error) {
      throw error;
    }
  }
}
