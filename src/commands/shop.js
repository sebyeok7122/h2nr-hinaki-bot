const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const {
  getPointBalance
} = require('../services/pointService');

const {
  getAllProducts,
  getProduct,
  getProductStock,
  purchaseProduct
} = require('../services/shopService');


function buildShopEmbed(
  guildId,
  userId
) {
  const balance =
    getPointBalance(
      guildId,
      userId
    );

  const products =
    getAllProducts();


  const productLines =
    products.map(
      (product) => {
        let stockText = '';

        if (
          product.usesStock
        ) {
          const stock =
            getProductStock(
              product.code
            );

          stockText =
            stock > 0
              ? ` · 재고 ${stock}개`
              : ' · **SOLD OUT**';
        }


        const description =
          product.description
            ? `\n　└ ${product.description}`
            : '';


        return (
          `**${product.name}**　${product.price}P${stockText}` +
          description
        );
      }
    );


  return new EmbedBuilder()
    .setTitle(
      '🛍️ 희낙샵'
    )
    .setDescription(
      [
        `💰 현재 보유 포인트: **${balance}P**`,
        '',
        ...productLines,
        '',
        '아래에서 원하는 상품을 선택해주세요. 💛',
      ].join('\n\n')
    );
}


function buildProductSelect() {
  const products =
    getAllProducts();


  const options =
    products.map(
      (product) => {
        const option =
          new StringSelectMenuOptionBuilder()
            .setLabel(
              `${product.name} · ${product.price}P`
            )
            .setValue(
              product.code
            );


        if (
          product.description
        ) {
          option.setDescription(
            product.description
          );
        }


        return option;
      }
    );


  const select =
    new StringSelectMenuBuilder()
      .setCustomId(
        'shop_select'
      )
      .setPlaceholder(
        '구매할 상품을 선택해주세요'
      )
      .addOptions(
        options
      );


  return new ActionRowBuilder()
    .addComponents(
      select
    );
}


function buildPurchaseButtons(
  productCode
) {
  const buyButton =
    new ButtonBuilder()
      .setCustomId(
        `shop_buy:${productCode}`
      )
      .setLabel(
        '구매하기'
      )
      .setEmoji(
        '✅'
      )
      .setStyle(
        ButtonStyle.Success
      );


  const closeButton =
    new ButtonBuilder()
      .setCustomId(
        'shop_close'
      )
      .setLabel(
        '닫기'
      )
      .setEmoji(
        '❎'
      )
      .setStyle(
        ButtonStyle.Secondary
      );


  return new ActionRowBuilder()
    .addComponents(
      buyButton,
      closeButton
    );
}


function buildSelectedProductEmbed(
  guildId,
  userId,
  product
) {
  const balance =
    getPointBalance(
      guildId,
      userId
    );


  const lines = [
    `🛒 선택 상품: **${product.name}**`,
    `💰 가격: **${product.price}P**`,
    `💎 현재 보유 포인트: **${balance}P**`,
  ];


  if (
    product.description
  ) {
    lines.push(
      '',
      `📝 ${product.description}`
    );
  }


  if (
    product.usesStock
  ) {
    const stock =
      getProductStock(
        product.code
      );


    lines.push(
      '',
      stock > 0
        ? `📦 남은 재고: **${stock}개**`
        : '🚫 **SOLD OUT**'
    );
  }


  lines.push(
    '',
    '구매하시겠어요?'
  );


  return new EmbedBuilder()
    .setTitle(
      '🛍️ 희낙샵 상품 확인'
    )
    .setDescription(
      lines.join('\n')
    );
}


async function handleShopInteraction(
  interaction
) {
  /*
   * 상품 선택
   */
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId ===
      'shop_select'
  ) {
    const productCode =
      interaction.values[0];


    const product =
      getProduct(
        productCode
      );


    if (!product) {
      await interaction.update({
        content:
          '❎ 존재하지 않는 상품입니다.',

        embeds: [],
        components: [],
      });

      return true;
    }


    await interaction.update({
      embeds: [
        buildSelectedProductEmbed(
          interaction.guildId,
          interaction.user.id,
          product
        ),
      ],

      components: [
        buildPurchaseButtons(
          product.code
        ),
      ],
    });


    return true;
  }


  /*
   * 구매하기
   */
  if (
    interaction.isButton() &&
    interaction.customId.startsWith(
      'shop_buy:'
    )
  ) {
    const productCode =
      interaction.customId.split(
        ':'
      )[1];


    const result =
      purchaseProduct(
        interaction.guildId,
        interaction.user.id,
        productCode
      );


    if (
      result.code ===
      'PRODUCT_NOT_FOUND'
    ) {
      await interaction.update({
        content:
          '❎ 존재하지 않는 상품입니다.',

        embeds: [],
        components: [],
      });

      return true;
    }


    if (
      result.code ===
      'INSUFFICIENT_POINTS'
    ) {
      await interaction.update({
        content:
          `😥 포인트가 부족합니다!\n\n` +
          `🛒 ${result.product.name}\n` +
          `💰 필요 포인트: **${result.required}P**\n` +
          `💎 현재 포인트: **${result.balance}P**`,

        embeds: [],
        components: [
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  'shop_close'
                )
                .setLabel(
                  '닫기'
                )
                .setEmoji(
                  '❎'
                )
                .setStyle(
                  ButtonStyle.Secondary
                )
            ),
        ],
      });

      return true;
    }


    if (
      result.code ===
      'SOLD_OUT'
    ) {
      await interaction.update({
        content:
          `🚫 **${result.product.name}** 상품은 현재 SOLD OUT이에요.`,

        embeds: [],
        components: [
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  'shop_close'
                )
                .setLabel(
                  '닫기'
                )
                .setEmoji(
                  '❎'
                )
                .setStyle(
                  ButtonStyle.Secondary
                )
            ),
        ],
      });

      return true;
    }


    if (
      result.code !==
      'PURCHASED'
    ) {
      await interaction.update({
        content:
          '❎ 구매 처리 중 문제가 발생했습니다.',

        embeds: [],
        components: [],
      });

      return true;
    }


    const purchaseLines = [
      '✅ **구매해주셔서 감사합니다!**',
      '',
      `🛍️ 상품: **${result.product.name}**`,
      `💸 **${result.price}P 차감 완료**`,
      `💰 남은 포인트: **${result.balanceAfter}P**`,
      `🧾 주문번호: \`${result.orderCode}\``,
    ];


    if (
      result.product.usesStock
    ) {
      purchaseLines.push(
        `📦 남은 재고: **${result.stock}개**`
      );
    }


    purchaseLines.push(
      '',
      '운영진이 구매내역을 확인한 뒤 처리해드릴게요. 💛'
    );


    await interaction.update({
      content:
        purchaseLines.join('\n'),

      embeds: [],

      components: [
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                'shop_close'
              )
              .setLabel(
                '닫기'
              )
              .setEmoji(
                '❎'
              )
              .setStyle(
                ButtonStyle.Secondary
              )
          ),
      ],
    });


    return true;
  }


  /*
   * 닫기
   */
  if (
    interaction.isButton() &&
    interaction.customId ===
      'shop_close'
  ) {
    await interaction.update({
      content:
        '🛍️ 희낙샵을 닫았습니다.',

      embeds: [],
      components: [],
    });


    return true;
  }


  return false;
}


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName(
        '희낙샵'
      )
      .setDescription(
        '희희낙락 포인트 상점을 이용합니다.'
      ),


  async execute(
    interaction
  ) {
    await interaction.reply({
      embeds: [
        buildShopEmbed(
          interaction.guildId,
          interaction.user.id
        ),
      ],

      components: [
        buildProductSelect(),
      ],

      /*
       * 상점은 본인에게만 보입니다.
       */
      ephemeral:
        true,
    });
  },


  handleShopInteraction,
};