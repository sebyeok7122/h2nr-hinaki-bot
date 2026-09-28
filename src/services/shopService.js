const {
  db
} = require('../database/db');

const {
  getPointBalance,
  deductPoints
} = require('./pointService');


const SHOP_PRODUCTS = {
  TITLE_12M: {
    code: 'TITLE_12M',
    name: '🌈 나만의 칭호역할 12개월',
    price: 800,
    description: '역할이 분류됩니다.',
    usesStock: false,
  },

  TITLE_6M: {
    code: 'TITLE_6M',
    name: '🌈 나만의 칭호역할 6개월',
    price: 500,
    description: '그라데이션이 추가됩니다.',
    usesStock: false,
  },

  TITLE_1M: {
    code: 'TITLE_1M',
    name: '🌈 나만의 칭호역할 한달',
    price: 120,
    description: null,
    usesStock: false,
  },

  PRIVATE_CHANNEL_1M: {
    code: 'PRIVATE_CHANNEL_1M',
    name: '🏠 나만의 전용채널 한달',
    price: 100,
    description: null,
    usesStock: false,
  },

  BAEMIN_10000: {
    code: 'BAEMIN_10000',
    name: '🍚 배민 10,000원',
    price: 200,
    description: null,
    usesStock: true,
  },

  KILL_FIRST_PICK: {
    code: 'KILL_FIRST_PICK',
    name: '🔫 킬내기 선픽권',
    price: 60,
    description: null,
    usesStock: false,
  },

  MAD_MOVIE: {
    code: 'MAD_MOVIE',
    name: '🎬 매드무비 신청',
    price: 50,
    description: null,
    usesStock: false,
  },
};


const selectStock =
  db.prepare(`
    SELECT
      product_code,
      product_name,
      stock

    FROM shop_inventory

    WHERE product_code = ?
  `);


const upsertStock =
  db.prepare(`
    INSERT INTO shop_inventory (
      product_code,
      product_name,
      stock,
      updated_at
    )
    VALUES (
      ?,
      ?,
      ?,
      datetime('now')
    )

    ON CONFLICT (product_code)
    DO UPDATE SET
      product_name = excluded.product_name,
      stock = excluded.stock,
      updated_at = datetime('now')
  `);


const decreaseStock =
  db.prepare(`
    UPDATE shop_inventory

    SET
      stock = stock - 1,
      updated_at = datetime('now')

    WHERE
      product_code = ?
      AND stock > 0
  `);


const insertPurchase =
  db.prepare(`
    INSERT INTO shop_purchases (
      order_code,
      guild_id,
      user_id,
      product_code,
      product_name,
      price,
      balance_after,
      status
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      'PURCHASED'
    )
  `);


function getProduct(
  productCode
) {
  return (
    SHOP_PRODUCTS[
      productCode
    ] || null
  );
}


function getAllProducts() {
  return Object.values(
    SHOP_PRODUCTS
  );
}


function getProductStock(
  productCode
) {
  const product =
    getProduct(
      productCode
    );


  if (!product) {
    return null;
  }


  if (
    !product.usesStock
  ) {
    return null;
  }


  const row =
    selectStock.get(
      productCode
    );


  return row
    ? Number(row.stock)
    : 0;
}


/*
 * 운영진이 재고를 원하는 수량으로
 * 직접 설정합니다.
 *
 * 예:
 * 0  → SOLD OUT
 * 5  → 재고 5개
 * 10 → 재고 10개
 */
function setProductStock(
  productCode,
  stock
) {
  const product =
    getProduct(
      productCode
    );


  if (!product) {
    return {
      code:
        'PRODUCT_NOT_FOUND',
    };
  }


  if (
    !product.usesStock
  ) {
    return {
      code:
        'STOCK_NOT_USED',

      product,
    };
  }


  if (
    !Number.isInteger(stock) ||
    stock < 0
  ) {
    return {
      code:
        'INVALID_STOCK',

      product,
    };
  }


  upsertStock.run(
    product.code,
    product.name,
    stock
  );


  return {
    code:
      'OK',

    product,

    stock:
      getProductStock(
        product.code
      ),
  };
}


function makeOrderCode() {
  const timePart =
    Date.now()
      .toString(36)
      .toUpperCase()
      .slice(-5);

  const randomPart =
    Math.random()
      .toString(36)
      .toUpperCase()
      .slice(2, 5);


  return (
    `H2NR-${timePart}${randomPart}`
  );
}


const purchaseTransaction =
  db.transaction(
    (
      guildId,
      userId,
      productCode
    ) => {
      const product =
        getProduct(
          productCode
        );


      if (!product) {
        return {
          code:
            'PRODUCT_NOT_FOUND',
        };
      }


      const balance =
        getPointBalance(
          guildId,
          userId
        );


      if (
        balance <
        product.price
      ) {
        return {
          code:
            'INSUFFICIENT_POINTS',

          balance,

          required:
            product.price,

          product,
        };
      }


      /*
       * 재고 상품이면 구매 직전에
       * 실제 재고를 다시 확인합니다.
       */
      if (
        product.usesStock
      ) {
        const stock =
          getProductStock(
            productCode
          );


        if (
          !stock ||
          stock <= 0
        ) {
          return {
            code:
              'SOLD_OUT',

            balance,

            product,
          };
        }


        const stockResult =
          decreaseStock.run(
            productCode
          );


        if (
          stockResult.changes === 0
        ) {
          return {
            code:
              'SOLD_OUT',

            balance,

            product,
          };
        }
      }


      const pointResult =
        deductPoints({
          guildId,
          userId,

          amount:
            product.price,

          source:
            'SHOP_PURCHASE',

          description:
            product.name,

          referenceType:
            'SHOP_PRODUCT',

          referenceId:
            product.code,
        });


      if (
        pointResult.code !==
        'OK'
      ) {
        throw new Error(
          `상점 포인트 차감 실패: ${userId}`
        );
      }


      const orderCode =
        makeOrderCode();


      insertPurchase.run(
        orderCode,
        guildId,
        userId,
        product.code,
        product.name,
        product.price,
        pointResult.balanceAfter
      );


      return {
        code:
          'PURCHASED',

        orderCode,

        product,

        price:
          product.price,

        balanceBefore:
          pointResult.balanceBefore,

        balanceAfter:
          pointResult.balanceAfter,

        stock:
          product.usesStock
            ? getProductStock(
                product.code
              )
            : null,
      };
    }
  );


function purchaseProduct(
  guildId,
  userId,
  productCode
) {
  return purchaseTransaction(
    guildId,
    userId,
    productCode
  );
}


module.exports = {
  SHOP_PRODUCTS,

  getProduct,
  getAllProducts,

  getProductStock,
  setProductStock,

  purchaseProduct,
};