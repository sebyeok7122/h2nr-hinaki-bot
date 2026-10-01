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
        '멤버의 포인트 획득 및 운영진 정정 내역을 확인합니다.'
      )

      .addUserOption(
        (option) =>
          option
            .setName(
              '대상'
            )
            .setDescription(
              '포인트 내역을 확인할 멤버'
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
     * 공개 포인트 로그
     *
     * 보여주는 기록:
     * 1. 포인트 획득 기록
     * 2. 운영진이 직접 처리한 차감 기록
     *
     * 숨기는 기록:
     * - 희낙샵 구매 차감
     */
    const transactions =
      getRecentPointTransactions(
        interaction.guildId,
        target.id,
        50
      )
        .filter(
          (transaction) =>
            transaction.amount > 0 ||
            transaction.source ===
              'STAFF_DEDUCT'
        )
        .slice(
          0,
          15
        );


    const embed =
      new EmbedBuilder()
        .setTitle(
          '📒 포인트 로그'
        );


    if (
      transactions.length === 0
    ) {
      embed.setDescription(
        [
          `👤 <@${target.id}>`,
          `💰 현재 포인트: **${balance}P**`,
          '',
          '아직 포인트 기록이 없습니다.',
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


            const amountText =
              transaction.amount > 0
                ? `+${transaction.amount}P`
                : `${transaction.amount}P`;


            return [
              `**${index + 1}. ${amountText} · ${reason}**`,
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
     * 공개 포인트 로그입니다.
     *
     * 희낙샵 구매내역은 공개하지 않습니다.
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