const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const {
  getPointBalance
} = require('../services/pointService');


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName('내포인트')
      .setDescription(
        '내가 보유한 희희낙락 포인트를 확인합니다.'
      ),


  async execute(
    interaction
  ) {
    const balance =
      getPointBalance(
        interaction.guildId,
        interaction.user.id
      );


    const embed =
      new EmbedBuilder()
        .setTitle(
          '💰 나의 희낙 포인트'
        )
        .setDescription(
          [
            `👤 <@${interaction.user.id}>`,
            '',
            `💎 현재 보유 포인트: **${balance}P**`,
            '',
            '포인트 획득 방법은 `/포인트획득`에서 확인할 수 있어요! 💛',
          ].join('\n')
        );


    await interaction.reply({
      embeds:
        [embed],

      /*
       * 본인에게만 보입니다.
       */
      ephemeral:
        true,

      allowedMentions: {
        parse: [],
      },
    });
  },
};