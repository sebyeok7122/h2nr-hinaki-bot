const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const {
  db
} = require('../database/db');


const selectMonthlyRanking =
  db.prepare(`
    SELECT
      user_id,
      COUNT(*) AS activity_count,
      SUM(points_awarded) AS total_points

    FROM newbie_activity

    WHERE
      guild_id = ?
      AND qualified = 1
      AND strftime(
        '%Y-%m',
        datetime(
          completed_at,
          '+9 hours'
        )
      ) =
      strftime(
        '%Y-%m',
        datetime(
          'now',
          '+9 hours'
        )
      )

    GROUP BY user_id

    ORDER BY
      activity_count DESC,
      total_points DESC,
      user_id ASC

    LIMIT 10
  `);


const selectAllTimeRanking =
  db.prepare(`
    SELECT
      user_id,
      COUNT(*) AS activity_count,
      SUM(points_awarded) AS total_points

    FROM newbie_activity

    WHERE
      guild_id = ?
      AND qualified = 1

    GROUP BY user_id

    ORDER BY
      activity_count DESC,
      total_points DESC,
      user_id ASC

    LIMIT 10
  `);


function getCurrentKoreanMonthLabel() {
  return new Intl.DateTimeFormat(
    'ko-KR',
    {
      timeZone:
        'Asia/Seoul',

      year:
        'numeric',

      month:
        'long',
    }
  ).format(
    new Date()
  );
}


function getRankEmoji(
  index
) {
  if (index === 0) {
    return '🥇';
  }

  if (index === 1) {
    return '🥈';
  }

  if (index === 2) {
    return '🥉';
  }

  return `${index + 1}.`;
}


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName(
        '신입활동'
      )
      .setDescription(
        '신입과 함께한 활동 랭킹을 확인합니다.'
      )

      .addStringOption(
        (option) =>
          option
            .setName(
              '기간'
            )
            .setDescription(
              '조회할 기간을 선택해주세요.'
            )
            .setRequired(false)
            .addChoices(
              {
                name:
                  '이번달',

                value:
                  'MONTH',
              },
              {
                name:
                  '누적',

                value:
                  'ALL',
              }
            )
      ),


  async execute(
    interaction
  ) {
    const period =
      interaction.options
        .getString(
          '기간'
        ) ||
      'MONTH';


    const rows =
      period === 'ALL'
        ? selectAllTimeRanking.all(
            interaction.guildId
          )
        : selectMonthlyRanking.all(
            interaction.guildId
          );


    const periodLabel =
      period === 'ALL'
        ? '전체 누적'
        : getCurrentKoreanMonthLabel();


    if (
      rows.length === 0
    ) {
      await interaction.reply({
        content:
          `🌱 **${periodLabel} 신입 활동**\n\n` +
          '아직 기록된 신입 활동이 없어요!',

        ephemeral: false,
      });

      return;
    }


    const rankingLines =
      rows.map(
        (
          row,
          index
        ) => {
          return (
            `${getRankEmoji(index)} ` +
            `<@${row.user_id}> ` +
            `· **${row.activity_count}회** ` +
            `· **+${row.total_points}P**`
          );
        }
      );


    const embed =
      new EmbedBuilder()
        .setTitle(
          '🌱 신입 활동 랭킹'
        )
        .setDescription(
          [
            `📅 **${periodLabel}**`,
            '',
            ...rankingLines,
            '',
            '신입과 함께해주셔서 감사합니다! 💚',
          ].join('\n')
        );


    await interaction.reply({
      embeds:
        [embed],

      allowedMentions: {
        parse: [],
      },
    });
  },
};