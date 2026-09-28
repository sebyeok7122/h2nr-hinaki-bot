const {
  SlashCommandBuilder
} = require('discord.js');

const {
  ROLE_IDS
} = require('../config/constants');

const {
  setProductStock
} = require('../services/shopService');


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName(
        '상점재고'
      )
      .setDescription(
        '운영진이 희낙샵 상품 재고를 설정합니다.'
      )

      .addStringOption(
        (option) =>
          option
            .setName(
              '상품'
            )
            .setDescription(
              '재고를 변경할 상품'
            )
            .setRequired(
              true
            )
            .addChoices(
              {
                name:
                  '🍚 배민 10,000원',
                value:
                  'BAEMIN_10000',
              }
            )
      )

      .addIntegerOption(
        (option) =>
          option
            .setName(
              '수량'
            )
            .setDescription(
              '설정할 재고 수량 (0이면 SOLD OUT)'
            )
            .setRequired(
              true
            )
            .setMinValue(
              0
            )
            .setMaxValue(
              999
            )
      ),


  async execute(
    interaction
  ) {
    /*
     * 운영진 역할 확인
     */
    if (
      !interaction.member.roles.cache.has(
        ROLE_IDS.STAFF
      )
    ) {
      await interaction.reply({
        content:
          '❎ 운영진만 사용할 수 있는 명령어입니다.',

        ephemeral:
          true,
      });

      return;
    }


    const productCode =
      interaction.options.getString(
        '상품',
        true
      );


    const stock =
      interaction.options.getInteger(
        '수량',
        true
      );


    const result =
      setProductStock(
        productCode,
        stock
      );


    if (
      result.code ===
      'PRODUCT_NOT_FOUND'
    ) {
      await interaction.reply({
        content:
          '❎ 존재하지 않는 상품입니다.',

        ephemeral:
          true,
      });

      return;
    }


    if (
      result.code ===
      'STOCK_NOT_USED'
    ) {
      await interaction.reply({
        content:
          '❎ 해당 상품은 재고 관리 상품이 아닙니다.',

        ephemeral:
          true,
      });

      return;
    }


    if (
      result.code ===
      'INVALID_STOCK'
    ) {
      await interaction.reply({
        content:
          '❎ 올바른 재고 수량을 입력해주세요.',

        ephemeral:
          true,
      });

      return;
    }


    if (
      result.code !==
      'OK'
    ) {
      await interaction.reply({
        content:
          '❎ 재고 변경 중 문제가 발생했습니다.',

        ephemeral:
          true,
      });

      return;
    }


    const stockMessage =
      result.stock === 0
        ? '🚫 **SOLD OUT**'
        : `📦 **재고 ${result.stock}개**`;


    await interaction.reply({
      content:
        `✅ **${result.product.name}** 재고 변경 완료!\n` +
        `${stockMessage}`,

      ephemeral:
        true,
    });
  },
};