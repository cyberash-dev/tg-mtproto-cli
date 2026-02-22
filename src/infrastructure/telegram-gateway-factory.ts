import type { CreateTelegramGateway, TelegramGateway } from "../domain/ports/telegram-gateway.js";
import { MtcuteTelegramGateway } from "./mtcute-telegram-gateway.js";

export const createTelegramGateway: CreateTelegramGateway = (params): TelegramGateway => {
  return new MtcuteTelegramGateway(params);
};
