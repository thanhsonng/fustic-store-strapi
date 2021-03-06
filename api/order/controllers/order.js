'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/v3.x/concepts/controllers.html#core-controllers)
 * to customize this controller
 */

const { sanitizeEntity } = require('strapi-utils');
const { removeUserInfo } = require('../../../utils/response');
const { CartValidator, StockValidator, StockSubtractor } = require('../../../utils/order');
const {
  orderConfirmationLocalTemplate,
  orderConfirmationWorldwideTemplate,
} = require('../../../utils/email');

async function calculateTotalAmount(cart) {
  const productIds = cart.map(({ product }) => product.id);
  const products = await strapi.services.product.find({ id_in: productIds });

  const generalConfig = await strapi.services['general-config'].find();
  const initTotal = {
    vnd: generalConfig.shipping_fee_vnd || 0,
    usd: generalConfig.shipping_fee_usd || 0,
  };

  return cart.reduce((acc, entry) => {
    const product = products.find((p) => p.id === entry.product.id);
    return {
      vnd: acc.vnd + product.price_vnd * entry.quantity,
      usd: acc.usd + product.price_usd * entry.quantity,
    };
  }, initTotal);
}

async function transformOrder(order) {
  let transformed = { ...order };
  transformed = sanitizeEntity(order, { model: strapi.models.order });
  transformed = removeUserInfo(transformed);
  return transformed;
}

module.exports = {
  async create(ctx) {
    const payload = typeof ctx.request.body === 'string'
      ? JSON.parse(ctx.request.body)
      : ctx.request.body;

    const cartValidator = new CartValidator(payload.products);
    const cartValid = await cartValidator.isValid();
    if (!cartValid) return ctx.badRequest('Cart is invalid');

    const stockValidator = new StockValidator(cartValidator);
    const stockValid = await stockValidator.isValid();
    if (!stockValid) return ctx.badRequest(await stockValidator.getEntries());

    const stockSubtractor = new StockSubtractor(stockValidator);
    await stockSubtractor.subtract();

    const totalAmount = await calculateTotalAmount(payload.products);
    const entity = await strapi.services.order.create({
      ...payload,
      total_amount_vnd: totalAmount.vnd,
      total_amount_usd: totalAmount.usd,
    });
    return transformOrder(entity);
  },

  async confirm(ctx) {
    const { id } = ctx.params;
    const order = await strapi.services.order.findOne({ id });
    const emailTemplate = order.country === 'Vietnam'
      ? orderConfirmationLocalTemplate
      : orderConfirmationWorldwideTemplate;

    const general_config = await strapi.services['general-config'].find();

    await strapi.plugins.email.services.email.sendTemplatedEmail(
      {
        to: order.email,
      },
      emailTemplate,
      {
        order,
        general_config,
      },
    );
    await strapi.services.order.update({ id }, {
      status: 'pending',
    });

    return { success: true };
  },

  async validate(ctx) {
    const cart = typeof ctx.request.body === 'string'
      ? JSON.parse(ctx.request.body)
      : ctx.request.body;

    const cartValidator = new CartValidator(cart);
    const cartValid = await cartValidator.isValid();
    if (!cartValid) return ctx.badRequest('Cart is invalid');

    const stockValidator = new StockValidator(cartValidator);
    const stockValid = await stockValidator.isValid();
    if (!stockValid) return ctx.badRequest(await stockValidator.getEntries());

    const totalAmount = await calculateTotalAmount(cart);
    return {
      valid: true,
      total_amount: totalAmount,
    }
  },
};
