const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');

const {
  createSetupSession,
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
        .setLabel(`${value}시`)
        .setValue(value)
    );
  }

  return options;
}


function createSquadRecruitCommand({
  name,
  description,
  type,
  title
}) {
  return {
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(description)

      .addUserOption(
        (option) =>
          option
            .setName('멤버1')
            .setDescription(
              '현재 함께 있는 멤버'
            )
            .setRequired(true)
      )

      .addUserOption(
        (option) =>
          option
            .setName('멤버2')
            .setDescription(
              '현재 함께 있는 멤버'
            )
            .setRequired(false)
      )

      .addUserOption(
        (option) =>
          option
            .setName('멤버3')
            .setDescription(
              '현재 함께 있는 멤버'
            )
            .setRequired(false)
      )

      .addUserOption(
        (option) =>
          option
            .setName('멤버4')
            .setDescription(
              '현재 함께 있는 멤버'
            )
            .setRequired(false)
      ),


    async execute(interaction) {
      const selectedUsers = [
        interaction.options.getUser(
          '멤버1',
          true
        ),

        interaction.options.getUser(
          '멤버2'
        ),

        interaction.options.getUser(
          '멤버3'
        ),

        interaction.options.getUser(
          '멤버4'
        ),
      ].filter(Boolean);


      const memberIds = [
        ...new Set(
          selectedUsers.map(
            (user) => user.id
          )
        ),
      ];


      createSetupSession({
        guildId:
          interaction.guildId,

        userId:
          interaction.user.id,

        type,

        capacity: 4,

        voiceKind:
          'SQUAD',
      });


      updateSetupSession(
        interaction.guildId,
        interaction.user.id,
        {
          memberIds,
        }
      );


      const mentions =
        memberIds
          .map(
            (id) => `<@${id}>`
          )
          .join(' ');


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


      await interaction.reply({
        content:
          `${title} **설정**\n\n` +
          `✅ 현재 멤버: ${mentions}\n\n` +
          '② 시작 예정 **시간**을 선택해주세요.',

        components: [row],

        ephemeral: true,
      });
    },
  };
}


module.exports = {
  createSquadRecruitCommand,
};