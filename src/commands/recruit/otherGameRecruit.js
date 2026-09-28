const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');

const {
  createSetupSession,
  updateSetupSession
} = require('../../services/recruitSetupService');


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


function addMemberOption(
  command,
  number,
  required = false
) {
  return command.addUserOption(
    (option) =>
      option
        .setName(`멤버${number}`)
        .setDescription(
          '현재 함께 있는 멤버'
        )
        .setRequired(required)
  );
}


let command =
  new SlashCommandBuilder()
    .setName('종겜구인')
    .setDescription(
      '종합게임 구인을 생성합니다.'
    )

    .addStringOption(
      (option) =>
        option
          .setName('게임명')
          .setDescription(
            '플레이할 게임 이름'
          )
          .setRequired(true)
          .setMaxLength(50)
    )

    .addIntegerOption(
      (option) =>
        option
          .setName('정원')
          .setDescription(
            '모집 정원을 선택해주세요.'
          )
          .setRequired(true)
          .addChoices(
            {
              name: '2명',
              value: 2,
            },
            {
              name: '3명',
              value: 3,
            },
            {
              name: '4명',
              value: 4,
            },
            {
              name: '5명',
              value: 5,
            },
            {
              name: '6명',
              value: 6,
            },
            {
              name: '7명',
              value: 7,
            },
            {
              name: '8명',
              value: 8,
            },
            {
              name: '9명',
              value: 9,
            },
            {
              name: '10명',
              value: 10,
            }
          )
    );


command =
  addMemberOption(
    command,
    1,
    true
  );

for (
  let number = 2;
  number <= 10;
  number += 1
) {
  command =
    addMemberOption(
      command,
      number
    );
}


module.exports = {
  data: command,


  async execute(interaction) {
    const gameName =
      interaction.options
        .getString(
          '게임명',
          true
        )
        .trim();

    const capacity =
      interaction.options
        .getInteger(
          '정원',
          true
        );


    const selectedUsers = [];

    for (
      let number = 1;
      number <= 10;
      number += 1
    ) {
      const user =
        interaction.options
          .getUser(
            `멤버${number}`,
            number === 1
          );

      if (user) {
        selectedUsers.push(
          user
        );
      }
    }


    const memberIds = [
      ...new Set(
        selectedUsers.map(
          (user) => user.id
        )
      ),
    ];


    if (
      memberIds.length >
      capacity
    ) {
      await interaction.reply({
        content:
          `❎ 선택한 멤버가 ${memberIds.length}명인데 정원은 ${capacity}명이에요.\n` +
          '정원보다 많은 멤버를 넣을 수 없습니다.',

        ephemeral: true,
      });

      return;
    }


    createSetupSession({
      guildId:
        interaction.guildId,

      userId:
        interaction.user.id,

      type:
        'OTHER_GAME',

      capacity,

      voiceKind:
        'OTHER_GAME',
    });


    updateSetupSession(
      interaction.guildId,
      interaction.user.id,
      {
        memberIds,
        gameName,
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
        '🎮 **종겜 구인 설정**\n\n' +
        `🎮 게임: **${gameName}**\n` +
        `👥 정원: **${capacity}명**\n` +
        `✅ 현재 멤버: ${mentions}\n\n` +
        '② 시작 예정 **시간**을 선택해주세요.',

      components: [row],

      ephemeral: true,
    });
  },
};