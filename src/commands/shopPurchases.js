const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const {
  db
} = require('../database/db');

const {
  ROLE_IDS
} = require('../config/constants');


const selectRecentPurchases =
  db.prepare(`
    SELECT
      order_code,
      user_id,
      product_name,
      price,
      balance_after,
      status,
      created_at

    FROM shop_purchases

    WHERE guild_id = ?

    ORDER BY id DESC

    LIMIT 15
  `);


function toDiscordTimestamp(
  sqliteDate
) {
  if (!sqliteDate) {
    return null;
  }


  /*
   * SQLite datetime('now')는 UTC 기준입니다.
   */
  const iso =
    sqliteDate
      .replace(
        ' ',
        'T'
      ) + 'Z';


  const date =
    new Date(
      iso
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return sqliteDate;
  }


  const unix =
    Math.floor(
      date.getTime() / 1000
    );


  return `<t:${unix}:f>`;
}


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName(
        '구매내역'
      )
      .setDescription(
        '운영진이 최근 희낙샵 구매내역을 확인합니다.'
      ),


  async execute(
    interaction
  ) {
    /*
     * 운영진 전용
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


    const purchases =
      selectRecentPurchases.all(
        interaction.guildId
      );


    if (
      purchases.length === 0
    ) {
      await interaction.reply({
        content:
          '🧾 아직 희낙샵 구매내역이 없습니다.',

        ephemeral:
          true,
      });

      return;
    }


    const purchaseBlocks =
      purchases.map(
        (
          purchase,
          index
        ) => {
          const time =
            toDiscordTimestamp(
              purchase.created_at
            );


          return [
            `**${index + 1}. 🧾 ${purchase.order_code}**`,
            `👤 구매자: <@${purchase.user_id}>`,
            `🛍️ 상품: **${purchase.product_name}**`,
            `💸 가격: **${purchase.price}P**`,
            `💰 구매 후 잔액: **${purchase.balance_after}P**`,
            `🕐 구매시간: ${time}`,
          ].join('\n');
        }
      );


    const embed =
      new EmbedBuilder()
        .setTitle(
          '🧾 희낙샵 최근 구매내역'
        )
        .setDescription(
          purchaseBlocks.join(
            '\n\n━━━━━━━━━━━━━━\n\n'
          )
        )
        .setFooter({
          text:
            '최근 구매 15건까지 표시됩니다.',
        });


    await interaction.reply({
      embeds: [
        embed,
      ],

      allowedMentions: {
        parse: [],
      },

      ephemeral:
        true,
    });
  },
};