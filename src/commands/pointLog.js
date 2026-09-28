const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const {
  getPointBalance,
  getRecentPointTransactions
} = require('../services/pointService');


function formatCreatedAt(
  createdAt
) {
  if (!createdAt) {
    return '시간 정보 없음';
  }


  const date =
    new Date(
      createdAt.replace(
        ' ',
        'T'
      ) + 'Z'
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return createdAt;
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
        '포인트로그'
      )
      .setDescription(
        '멤버의 포인트 획득 내역을 확인합니다.'
      )

      .addUserOption(
        (option) =>
          option
            .setName(
              '대상'
            )
            .setDescription(
              '포인트 획득 내역을 확인할 멤버'
            )
            .setRequired(
              true
            )
      ),


  async execute(
    interaction
  ) {
    const target =
      interaction.options.getUser(
        '대상',
        true
      );


    const balance =
      getPointBalance(
        interaction.guildId,
        target.id
      );


    /*
     * 최근 기록을 넉넉하게 가져온 뒤
     * +포인트 기록만 공개합니다.
     *
     * 상점 구매, 포인트 사용 등
     * 마이너스 기록은 공개하지 않습니다.
     */
    const transactions =
      getRecentPointTransactions(
        interaction.guildId,
        target.id,
        50
      )
        .filter(
          (transaction) =>
            transaction.amount > 0
        )
        .slice(
          0,
          15
        );


    const embed =
      new EmbedBuilder()
        .setTitle(
          '📒 포인트 획득 로그'
        );


    if (
      transactions.length === 0
    ) {
      embed.setDescription(
        [
          `👤 <@${target.id}>`,
          `💰 현재 포인트: **${balance}P**`,
          '',
          '아직 포인트 획득 기록이 없습니다.',
        ].join('\n')
      );

    } else {
      const lines =
        transactions.map(
          (
            transaction,
            index
          ) => {
            const reason =
              transaction.description ||
              transaction.source;


            return [
              `**${index + 1}. +${transaction.amount}P · ${reason}**`,
              `└ ${formatCreatedAt(transaction.created_at)}`,
            ].join('\n');
          }
        );


      embed.setDescription(
        [
          `👤 <@${target.id}>`,
          `💰 현재 포인트: **${balance}P**`,
          '',
          ...lines,
        ].join('\n\n')
      );
    }


    /*
     * 서버 멤버 모두가 볼 수 있는
     * 공개 포인트 획득 로그입니다.
     */
    await interaction.reply({
      embeds:
        [embed],

      allowedMentions: {
        parse: [],
      },
    });
  },
};