import { createLogger, format, transports } from 'winston';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

(dayjs as any).extend(utc);
(dayjs as any).extend(timezone);


export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.ms(),
    format.printf(
      (info) => `${info.timestamp} ${info.level}: ${info.message}`,
    ),
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize({ all: true }),
        format.timestamp({
          format: () => dayjs().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss'),
        }),
        format.ms(),
        format.printf(
          (info) => `${info.timestamp} ${info.level}: ${info.message}`,
        ),
      ),
    }),
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: format.combine(
        format.timestamp({
          format: () => dayjs().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss'),
        }),
        format.json(),
      ),
    }),
    new transports.File({
      filename: 'logs/combined.log',
      format: format.combine(
        format.timestamp({
          format: () => dayjs().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss'),
        }),
        format.json(),
      ),
    }),
  ],
});
