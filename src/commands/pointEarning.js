const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName('포인트획득')
      .setDescription(
        '희희낙락 포인트 획득 방법을 확인합니다.'
      ),


  async execute(
    interaction
  ) {
    const embed =
      new EmbedBuilder()
        .setTitle(
          '💰 희희낙락 포인트 획득 안내'
        )
        .setDescription(
          [
            '희희낙락에서 활동하며 포인트를 모아보세요! 💛',
            '',
            '🏅 **우수회원**　`+3P`',
            '🏆 **2연속 우수회원**　`+6P`',
            '',
            '🔫 **킬내기 참여**　`+1P`',
            '👑 **킬내기 우승**　`+2P`',
            '',
            '🎉 **이벤트 참여**　`+3P`',
            '🏆 **이벤트 우승**　`+5P`',
            '',
            '🍗 **치킨 인증**　`+1P`',
            '🌱 **신입과 치킨 인증**　`+2P`',
            '',
            '🎬 **매드무비 제보**　`+1P`',
            '',
            '━━━━━━━━━━━━━━━━━━',
            '',
            '🌱 신입과 함께하는 파티 활동 등',
            '일부 포인트는 희낙이가 자동으로 지급해요!',
          ].join('\n')
        );


    await interaction.reply({
      embeds:
        [embed],
    });
  },
};