import { Stripe } from "stripe";
import config from "../../config.ts";

export const stripe = new Stripe(config.STRIPE_SECRET, {
  apiVersion: "2022-11-15",
});
export default stripe;
