import { Stripe } from 'stripe';
import config from '../../config.ts';

// Our default API version doesn't match the one in the library, so cast it
// There may be type mismatches that we can ignore
export const stripe = new Stripe(config.STRIPE_SECRET, {
  apiVersion: '2018-02-28' as '2020-08-27',
});
export default stripe;
