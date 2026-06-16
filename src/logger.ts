import type { PluginToUiMessage } from './shared';

export type LogLevel = 'info' | 'warn' | 'error';
export type LogSink = (message: PluginToUiMessage) => void;

let sink: LogSink | undefined;

export function setLogSink(nextSink: LogSink): void {
  sink = nextSink;
}

export const logger = {
  info(message: string): void {
    emit('info', message);
  },
  warn(message: string): void {
    emit('warn', message);
  },
  error(message: string): void {
    emit('error', message);
  },
};

function emit(level: LogLevel, message: string): void {
  sink?.({ type: 'log', level, message });
}
