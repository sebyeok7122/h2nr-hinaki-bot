
const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const {
  db
} = require('../database/db');

const {
  getPointBalance
} = require('../services/pointService');


/*
 * 현재 보유 포인트를 기준으로
 * 자신의 전체 순위를 조회합니다.
 *
 * 동일 포인트는 공동 순위입니다.
 * 기존 DB 데이터는 수정하지 않습니다.
 */
const selectMyRank = db.prepare(`
  SELECT
    COUNT(*) + 1 AS ranking
  FROM users
  WHERE
    guild_id = ?
    AND points > ?
`);


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName('내포인트')
      .setDescription(
        '나의 희낙 포인트와 순위를 확인합니다.'
      ),


  async execute(interaction) {
    const balance =
      getPointBalance(
        interaction.guildId,
        interaction.user.id
      );


    let rankingText =
      '아직 순위가 없어요!';

    if (balance > 0) {
      const rank =
        selectMyRank.get(
          interaction.guildId,
          balance
        );

      rankingText =
        `🏆 **${rank.ranking}위**`;
    }


    const embed =
      new EmbedBuilder()
        .setColor(0xFFD76A)
        .setTitle(
          '💰 나의 희낙 포인트'
        )
        .setDescription(
          [
            `👤 <@${interaction.user.id}>`,
            '',
            `💎 현재 보유 포인트: **${balance.toLocaleString('ko-KR')}P**`,
            '',
            `🏅 나의 포인트 순위: ${rankingText}`,
            '',
            '전체 TOP 10은 `/포인트순위`에서 확인할 수 있어요! 💛'
          ].join('\n')
        )
        .setFooter({
          text: '현재 보유 포인트 기준 · 동일 포인트 공동 순위'
        });


    await interaction.reply({
      embeds: [embed],

      ephemeral: true,

      allowedMentions: {
        parse: []
      }
    });
  }
};
