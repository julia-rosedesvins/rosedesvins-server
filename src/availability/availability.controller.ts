import { Controller, Post, Get, Body, UseGuards, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import { UserGuard } from '../guards/user.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { SaveAvailabilityDto, SaveAvailabilitySchema } from '../validators/availability.validators';

@ApiTags('Availability')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post('save')
  @UseGuards(UserGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save user availability settings' })
  @ApiBearerAuth('user-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        weeklyAvailability: {
          type: 'object',
          properties: {
            monday: {
              type: 'object',
              properties: {
                isAvailable: { type: 'boolean', example: true },
                timeSlots: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      startTime: { type: 'string', example: '09:00', description: 'Time in HH:mm format (24-hour)' },
                      endTime: { type: 'string', example: '12:00', description: 'Time in HH:mm format (24-hour)' }
                    },
                    required: ['startTime', 'endTime']
                  },
                  example: [
                    { startTime: '09:00', endTime: '12:00' },
                    { startTime: '14:00', endTime: '17:00' }
                  ]
                }
              }
            },
            tuesday: {
              type: 'object',
              properties: {
                isAvailable: { type: 'boolean', example: true },
                timeSlots: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      startTime: { type: 'string', example: '14:00' },
                      endTime: { type: 'string', example: '17:00' }
                    },
                    required: ['startTime', 'endTime']
                  },
                  example: [
                    { startTime: '14:00', endTime: '17:00' }
                  ]
                }
              }
            },
            wednesday: {
              type: 'object',
              properties: {
                isAvailable: { type: 'boolean', example: false },
                timeSlots: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      startTime: { type: 'string' },
                      endTime: { type: 'string' }
                    }
                  },
                  example: []
                }
              }
            },
            thursday: {
              type: 'object',
              properties: {
                isAvailable: { type: 'boolean', example: true },
                timeSlots: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      startTime: { type: 'string', example: '10:00' },
                      endTime: { type: 'string', example: '16:00' }
                    },
                    required: ['startTime', 'endTime']
                  },
                  example: [
                    { startTime: '10:00', endTime: '16:00' }
                  ]
                }
              }
            },
            friday: {
              type: 'object',
              properties: {
                isAvailable: { type: 'boolean', example: true },
                timeSlots: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      startTime: { type: 'string', example: '09:00' },
                      endTime: { type: 'string', example: '15:00' }
                    },
                    required: ['startTime', 'endTime']
                  },
                  example: [
                    { startTime: '09:00', endTime: '15:00' }
                  ]
                }
              }
            },
            saturday: {
              type: 'object',
              properties: {
                isAvailable: { type: 'boolean', example: false },
                timeSlots: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      startTime: { type: 'string' },
                      endTime: { type: 'string' }
                    }
                  },
                  example: []
                }
              }
            },
            sunday: {
              type: 'object',
              properties: {
                isAvailable: { type: 'boolean', example: false },
                timeSlots: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      startTime: { type: 'string' },
                      endTime: { type: 'string' }
                    }
                  },
                  example: []
                }
              }
            }
          },
          required: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        },
        publicHolidays: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'Christmas Day' },
              date: { type: 'string', format: 'date-time', example: '2025-12-25T00:00:00.000Z' },
              isBlocked: { type: 'boolean', example: true },
              isRecurring: { type: 'boolean', example: true },
              description: { type: 'string', example: 'Annual Christmas holiday' }
            },
            required: ['name', 'date']
          },
          example: [
            {
              name: 'Christmas Day',
              date: '2025-12-25T00:00:00.000Z',
              isBlocked: true,
              isRecurring: true,
              description: 'Annual Christmas holiday'
            }
          ]
        },
        specialDateOverrides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', format: 'date-time', example: '2025-10-15T00:00:00.000Z' },
              isAvailable: { type: 'boolean', example: false },
              timeSlots: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    startTime: { type: 'string', example: '10:00' },
                    endTime: { type: 'string', example: '15:00' }
                  }
                }
              },
              reason: { type: 'string', example: 'Personal day off' }
            },
            required: ['date', 'isAvailable']
          },
          example: [
            {
              date: '2025-10-15T00:00:00.000Z',
              isAvailable: false,
              reason: 'Personal day off'
            }
          ]
        },
        timezone: { type: 'string', example: 'Europe/Paris', default: 'Europe/Paris' },
        defaultSlotDuration: { type: 'number', example: 30, default: 30, description: 'Duration in minutes (5-480)' },
        bufferTime: { type: 'number', example: 5, default: 0, description: 'Buffer time in minutes (0-120)' },
        isActive: { type: 'boolean', example: true, default: true }
      },
      required: ['weeklyAvailability']
    }
  })
  async saveAvailability(
    @Body(new ZodValidationPipe(SaveAvailabilitySchema)) saveAvailabilityDto: SaveAvailabilityDto,
    @CurrentUser() currentUser: any,
  ) {
    const userId = currentUser.sub; // Extract user ID from JWT token
    
    const savedAvailability = await this.availabilityService.saveAvailability(
      saveAvailabilityDto,
      userId
    );

    return {
      success: true,
      message: 'Availability settings saved successfully',
      data: savedAvailability,
    };
  }

  @Get('me')
  @UseGuards(UserGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user availability settings' })
  @ApiBearerAuth('user-token')
  async getUserAvailability(
    @CurrentUser() currentUser: any,
  ) {
    const userId = currentUser.sub; // Extract user ID from JWT token
    
    const availability = await this.availabilityService.getUserAvailability(userId);

    if (!availability) {
      return {
        success: true,
        message: 'No availability settings found for this user',
        data: null,
      };
    }

    return {
      success: true,
      message: 'User availability settings retrieved successfully',
      data: availability,
    };
  }
}
