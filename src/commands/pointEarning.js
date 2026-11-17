const {
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const {
  RECRUIT_CONFIG
} = require('../config/constants');


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
            `🌱 **신입 파티 활동 완료**　기존 멤버 \`+${RECRUIT_CONFIG.NEWBIE_ACTIVITY_POINTS}P\` / 신입 \`+${RECRUIT_CONFIG.NEWBIE_PARTICIPATION_POINTS}P\``,
            '신입 파티 활동 보상은 **1인당 하루 1회** 자동 지급돼요.',
            `💛 신입은 **${RECRUIT_CONFIG.NEWBIE_PROMOTION_POINTS}P** 달성 시 정식 멤버로 자동등업돼요!`,
          ].join('\n')
        );


    await interaction.reply({
      embeds:
        [embed],
    });
  },
};