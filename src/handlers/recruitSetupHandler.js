const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');

const {
  getSetupSession,
  updateSetupSession
} = require('../services/recruitSetupService');

function buildHourOptions() {
  const options = [];

  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {
    const value =
      String(hour).padStart(
        2,
        '0'
      );

    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(
          `${value}시`
        )
        .setValue(value)
    );
  }

  return options;
}

async function handleRecruitSetupInteraction(
  interaction
) {
  if (
    interaction.isUserSelectMenu() &&
    interaction.customId ===
      'recruit_setup_members'
  ) {
    const session =
      getSetupSession(
        interaction.guildId,
        interaction.user.id
      );

    if (!session) {
      await interaction.reply({
        content:
          '⏰ 구인 설정 시간이 만료됐어요. 다시 명령어를 실행해주세요.',
        ephemeral: true,
      });

      return true;
    }

    updateSetupSession(
      interaction.guildId,
      interaction.user.id,
      {
        memberIds:
          interaction.values,
      }
    );

    const hourSelect =
      new StringSelectMenuBuilder()
        .setCustomId(
          'recruit_setup_hour'
        )
        .setPlaceholder(
          '시작 예정 시간을 선택해주세요'
        )
        .addOptions(
          buildHourOptions()
        );

    const row =
      new ActionRowBuilder()
        .addComponents(
          hourSelect
        );

    const members =
      interaction.values
        .map(
          (id) => `<@${id}>`
        )
        .join(' ');

    await interaction.update({
      content:
        '🎮 **일반게임 구인 설정**\n\n' +
        `✅ 현재 멤버: ${members}\n\n` +
        '② 시작 예정 **시간**을 선택해주세요.',
      components: [row],
    });

    return true;
  }

  return false;
}

module.exports = {
  handleRecruitSetupInteraction,
};