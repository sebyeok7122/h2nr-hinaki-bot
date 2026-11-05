
const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const {
  db
} = require('../database/db');


/*
 * 현재 보유 포인트 TOP 10 조회
 *
 * 기존 users 테이블을 읽기만 합니다.
 * 포인트 지급, 차감, 초기화는 하지 않습니다.
 */
const selectTopPoints = db.prepare(`
  SELECT
    user_id,
    points
  FROM users
  WHERE
    guild_id = ?
    AND points > 0
  ORDER BY
    points DESC,
    user_id ASC
  LIMIT 10
`);


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName('포인트순위')
      .setDescription(
        '희희낙락 포인트 TOP 10을 확인합니다.'
      ),


  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({
        content:
          '서버에서만 사용할 수 있어요!',
        ephemeral: true
      });
    }


    const users =
      selectTopPoints.all(
        interaction.guildId
      );


    let previousPoints = null;
    let currentRank = 0;


    const lines = users.map(
      (user, index) => {
        /*
         * 같은 포인트는 공동 순위입니다.
         *
         * 예: 1위, 1위, 3위
         */
        if (
          previousPoints !== user.points
        ) {
          currentRank = index + 1;
        }

        previousPoints = user.points;


        let medal = '🏅';

        if (currentRank === 1) {
          medal = '🥇';
        } else if (currentRank === 2) {
          medal = '🥈';
        } else if (currentRank === 3) {
          medal = '🥉';
        }


        const points =
          user.points.toLocaleString(
            'ko-KR'
          );


        return (
          `${medal} **${currentRank}위** ` +
          `<@${user.user_id}>` +
          ` — **${points}P**`
        );
      }
    );


    const embed =
      new EmbedBuilder()
        .setColor(0xFFD76A)
        .setTitle(
          '🏆 희희낙락 포인트 TOP 10'
        )
        .setDescription(
          lines.length > 0
            ? lines.join('\n\n')
            : '아직 포인트를 보유한 회원이 없어요! 💛'
        )
        .setFooter({
          text:
            '현재 보유 포인트 기준 · 동일 포인트 공동 순위'
        });


    await interaction.reply({
      embeds: [embed],

      allowedMentions: {
        parse: []
      }
    });
  }
};
