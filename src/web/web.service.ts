import { Injectable } from '@nestjs/common';
import { Response, Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class WebService {
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.wmv': 'video/x-ms-wmv',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  async streamVideo(filename: string, req: Request, res: Response) {
    try {
      const videoPath = path.join(process.cwd(), 'src', 'web', 'statics', filename);
      
      // Check if file exists
      if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ message: 'Video not found' });
      }

      const stat = fs.statSync(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;
      const mimeType = this.getMimeType(filename);

    // Set common headers for video with explicit video content indication
    const commonHeaders = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Content-Disposition': 'inline; filename="' + filename + '"',
      'X-Content-Type-Options': 'nosniff',
    };

    if (range) {
      // Handle range requests for video streaming with proper validation
      const parts = range.replace(/bytes=/, "").split("-");
      let start = parseInt(parts[0], 10);
      let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      // Validate and fix range values
      if (isNaN(start)) start = 0;
      if (isNaN(end)) end = fileSize - 1;
      
      // Ensure start is not greater than file size
      if (start >= fileSize) {
        start = fileSize - 1;
      }
      
      // Ensure end is not greater than file size
      if (end >= fileSize) {
        end = fileSize - 1;
      }
      
      // Ensure start is not greater than end
      if (start > end) {
        start = 0;
        end = fileSize - 1;
      }
      
      const chunksize = (end - start) + 1;
      
      try {
        const file = fs.createReadStream(videoPath, { start, end });
        
        const head = {
          ...commonHeaders,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': chunksize,
        };
        
        res.writeHead(206, head);
        file.pipe(res);
      } catch (error) {
        console.error('Error creating read stream:', error);
        return res.status(416).json({ message: 'Range Not Satisfiable' });
      }
    } else {
      // Send entire file
      const head = {
        ...commonHeaders,
        'Content-Length': fileSize,
      };
      
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
    } catch (error) {
      console.error('Error streaming video:', error);
      if (!res.headersSent) {
        return res.status(500).json({ message: 'Internal server error while streaming video' });
      }
    }
  }

  async serveImage(imageName: string, res: Response, req?: Request) {
    try {
      // Validate image name to prevent directory traversal
      if (imageName.includes('..') || imageName.includes('/') || imageName.includes('\\')) {
        return res.status(400).json({ message: 'Invalid image name' });
      }

      // Ensure it's a PNG file (add .png if not provided)
      const fileName = imageName.endsWith('.png') ? imageName : `${imageName}.png`;
      
      const imagePath = path.join(process.cwd(), 'src', 'web', 'statics', fileName);
      
      // Check if file exists
      if (!fs.existsSync(imagePath)) {
        return res.status(404).json({ message: 'Image not found' });
      }

      // Get file stats and mime type
      const stat = fs.statSync(imagePath);
      const mimeType = this.getMimeType(fileName);

      // Set headers for image serving
      const headers = {
        'Content-Type': mimeType,
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        'Last-Modified': stat.mtime.toUTCString(),
        'ETag': `"${stat.size}-${stat.mtime.getTime()}"`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'X-Content-Type-Options': 'nosniff',
      };

      // Check if client has cached version (ETag)
      if (req) {
        const clientETag = req.headers['if-none-match'];
        const serverETag = headers.ETag;
        
        if (clientETag === serverETag) {
          return res.status(304).end();
        }
      }

      // Send image
      res.set(headers);
      const imageStream = fs.createReadStream(imagePath);
      imageStream.pipe(res);
      
    } catch (error) {
      console.error('Error serving image:', error);
      if (!res.headersSent) {
        return res.status(500).json({ message: 'Internal server error while serving image' });
      }
    }
  }

  getDemoPage(res: Response) {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Hero Video Demo</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        video { width: 100%; max-width: 800px; height: auto; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #333; }
        .code-block { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
        pre { margin: 0; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Hero Video Demo</h1>
        
        <h2>Using HTML Video Tag (Recommended for Autoplay)</h2>
        <video autoplay muted loop controls>
            <source src="/v1/web/video/hero-section" type="video/mp4">
            Your browser does not support the video tag.
        </video>

        <h2>Using Iframe (Alternative)</h2>
        <iframe 
            src="/v1/web/video/hero-section" 
            width="800" 
            height="450" 
            frameborder="0" 
            allowfullscreen>
        </iframe>

        <h2>Implementation Code</h2>
        <div class="code-block">
            <h3>For Frontend (HTML Video Tag - Recommended)</h3>
            <pre><code>&lt;video autoplay muted loop controls&gt;
    &lt;source src="https://api.rosedesvins.co/v1/web/video/hero-section" type="video/mp4"&gt;
    Your browser does not support the video tag.
&lt;/video&gt;</code></pre>
        </div>

        <div class="code-block">
            <h3>For Frontend (Iframe - Alternative)</h3>
            <pre><code>&lt;iframe 
    src="https://api.rosedesvins.co/v1/web/video/hero-section" 
    width="800" 
    height="450" 
    frameborder="0" 
    allowfullscreen&gt;
&lt;/iframe&gt;</code></pre>
        </div>

        <div class="code-block">
            <h3>For React/Next.js</h3>
            <pre><code>&lt;video autoplay muted loop controls&gt;
    &lt;source src={process.env.NEXT_PUBLIC_BACKEND_URL + "/v1/web/video/hero-section"} type="video/mp4" /&gt;
    Your browser does not support the video tag.
&lt;/video&gt;</code></pre>
        </div>

        <p><strong>Note:</strong> The video tag with <code>autoplay muted</code> attributes is recommended for autoplay functionality as most browsers require muted autoplay for user experience reasons.</p>
    </div>
</body>
</html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }
}
