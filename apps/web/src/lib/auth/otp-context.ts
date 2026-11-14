import { AsyncLocalStorage } from "node:async_hooks";
import type { OtpChannel, OtpDeliveryResult } from "@workspace/communication/otp";

/**
 * The channel a sign-in code should go out on, carried from our send route
 * into better-auth's sendOTP callback.
 *
 * better-auth generates and stores the code, then calls sendOTP; it has no
 * notion of a channel and no way to pass one. So /api/login-otp/send decides
 * the channel under the attempt policy, runs the send inside this context,
 * and reads the delivery result back out of it afterwards.
 *
 * It is also the gate. better-auth serves its own /phone-number/send-otp
 * endpoint publicly, and that endpoint sends to any number with no check at
 * all. A call arriving through it has no context here, and sendOTP refuses
 * it — so the only door into sending a code is the one with the policy on it.
 */
export interface OtpSendContext {
  channel: OtpChannel;
  result?: OtpDeliveryResult;
}

export const otpSendContext = new AsyncLocalStorage<OtpSendContext>();
