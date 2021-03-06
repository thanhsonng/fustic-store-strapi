'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/v3.x/concepts/controllers.html#core-controllers)
 * to customize this controller
 */
const pluralize = require('pluralize');
const { sanitizeEntity } = require('strapi-utils');
const { removeUserInfo } = require('../../../utils/response');

function transformCategory(category) {
  let transformed = { ...category };
  transformed = removeUserInfo(transformed);
  transformed.singular_name = pluralize.singular(transformed.name);
  return transformed;
}

function transformImages(images) {
  return images.map((image, i) => {
    let transformed = { ...image };
    transformed = {
      ...transformed,
      is_thumbnail: i === 0,
      is_alt_thumbnail: i === 1,
    };
    transformed = removeUserInfo(transformed);
    if (process.env.NODE_ENV === 'development') {
      transformed.url = `http://localhost:1337${transformed.url}`;
      Object.entries(transformed.formats).forEach(([_, format]) => {
        format.url = `http://localhost:1337${format.url}`;
      })
    }
    return transformed;
  });
}

function transformProduct(product) {
  let transformed = { ...product };

  transformed = sanitizeEntity(transformed, { model: strapi.models.product });
  transformed = removeUserInfo(transformed);

  transformed.category = transformCategory(transformed.category);
  transformed.images = transformImages(transformed.images);

  return transformed;
}

module.exports = {
  async find(ctx) {
    let entities;
    if (ctx.query._q) {
      entities = await strapi.services.product.search(ctx.query);
    } else {
      entities = await strapi.services.product.find(ctx.query);
    }

    return entities.map(transformProduct);
  },

  async findOne(ctx) {
    const { id } = ctx.params;
    let entity;
    try {
      entity = await strapi.services.product.findOne({ id });
    } catch {
      entity = await strapi.services.product.findOne({ slug: id });
    }
    return transformProduct(entity);
  },
};
