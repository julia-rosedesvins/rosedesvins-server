import { Controller, Get, Res, Req, Version } from '@nestjs/common';
import { WebService } from './web.service';
import { Response, Request } from 'express';

@Controller('web')
export class WebController {
  constructor(private readonly webService: WebService) {}

  @Version('1')
  @Get('video/hero-section')
  async getHeroVideo(@Req() req: Request, @Res() res: Response) {
    return this.webService.streamVideo('rosedesvins.mp4', req, res);
  }

  @Version('1')
  @Get('image/:imageName')
  async getImage(@Req() req: Request, @Res() res: Response) {
    const imageName = req.params.imageName;
    return this.webService.serveImage(imageName, res, req);
  }

  @Version('1')
  @Get('demo')
  getDemoPage(@Res() res: Response) {
    return this.webService.getDemoPage(res);
  }
}
