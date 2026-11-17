const {
  SlashCommandBuilder,
  MessageFlags
} = require('discord.js');

const {
  db
} = require('../database/db');

const {
  ROLE_IDS,
  RECRUIT_CONFIG
} = require('../config/constants');

const {
  ensureNewbiePartyProgress,
  getNewbiePartyProgress,
  completeNewbieParty,
  promoteAwardedNewbies
} = require('../services/newbieActivityService');


const REQUIRED_SECONDS =
  RECRUIT_CONFIG.NEWBIE_MIN_VOICE_MINUTES * 60;


/*
 * 신입파티 정보 확인
 */
const selectRecruitment =
  db.prepare(`
    SELECT
      id,
      guild_id,
      channel_id,
      type,
      capacity,
      status

    FROM recruitments

    WHERE
      id = ?
      AND guild_id = ?
      AND type = 'NEWBIE'
  `);


/*
 * 해당 신입파티의 실제 등록 참가자
 */
const selectActiveMembers =
  db.prepare(`
    SELECT user_id

    FROM recruitment_members

    WHERE
      recruitment_id = ?
      AND is_active = 1

    ORDER BY joined_at ASC
  `);


/*
 * 운영진이 실제 활동 완료를 확인했을 때
 * 필요한 시간까지 활동시간을 보정합니다.
 *
 * 이미 더 많은 시간이 저장되어 있다면
 * 기존 시간을 줄이지 않습니다.
 */
const repairProgress =
  db.prepare(`
    UPDATE newbie_party_progress

    SET
      accumulated_seconds =
        CASE
          WHEN accumulated_seconds < ?
          THEN ?
          ELSE accumulated_seconds
        END,

      is_running = 0,
      running_since = NULL,
      updated_at = datetime('now')

    WHERE
      recruitment_id = ?
      AND completed = 0
  `);


module.exports = {
  data:
    new SlashCommandBuilder()
      .setName(
        '신입활동보정'
      )
      .setDescription(
        '오류 등으로 누락된 신입파티 활동 완료를 운영진이 보정합니다.'
      )

      .addIntegerOption(
        (option) =>
          option
            .setName(
              '구인번호'
            )
            .setDescription(
              '보정할 신입파티 구인번호'
            )
            .setRequired(
              true
            )
            .setMinValue(
              1
            )
      ),


  async execute(
    interaction
  ) {
    /*
     * 운영진 전용
     */
    if (
      !interaction.member.roles.cache.has(
        ROLE_IDS.STAFF
      )
    ) {
      await interaction.reply({
        content:
          '❎ 운영진만 사용할 수 있는 명령어입니다.',

        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }


    const recruitmentId =
      interaction.options.getInteger(
        '구인번호',
        true
      );


    const recruitment =
      selectRecruitment.get(
        recruitmentId,
        interaction.guildId
      );


    if (!recruitment) {
      await interaction.reply({
        content:
          `❎ 구인 #${recruitmentId} 신입파티를 찾을 수 없습니다.`,

        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }


    const memberIds =
      selectActiveMembers
        .all(
          recruitmentId
        )
        .map(
          (row) =>
            row.user_id
        );


    /*
     * 원래 정원이 모두 등록된 파티만
     * 강제 완료할 수 있게 합니다.
     *
     * 실수로 미완성 파티를 완료처리하는 것을
     * 방지하기 위한 안전장치입니다.
     */
    if (
      memberIds.length !==
      recruitment.capacity
    ) {
      await interaction.reply({
        content:
          '❎ 현재 등록 참가자가 정원과 일치하지 않습니다.\n' +
          `등록 인원: **${memberIds.length}/${recruitment.capacity}명**\n\n` +
          '잘못된 파티를 보정하는 것을 막기 위해 처리를 중단했습니다.',

        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }


    /*
     * 이미 정상 완료된 파티인지 먼저 확인
     */
    ensureNewbiePartyProgress(
      interaction.guildId,
      recruitmentId
    );


    const beforeProgress =
      getNewbiePartyProgress(
        recruitmentId
      );


    if (
      beforeProgress?.completed
    ) {
      await interaction.reply({
        content:
          `✅ 구인 #${recruitmentId}은 이미 신입활동 완료 처리된 파티입니다.\n` +
          '중복 포인트는 지급하지 않았어요.',

        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }


    // 자동 처리와 동일하게 현재 Discord 역할을 보상 기준으로 사용합니다.
    const helperUserIds = [];
    const newbieUserIds = [];

    for (
      const userId of memberIds
    ) {
      let member;


      try {
        member =
          interaction.guild.members.cache.get(
            userId
          ) ||
          await interaction.guild.members.fetch(
            userId
          );

      } catch (error) {
        console.error(
          `❌ [신입활동 보정] 멤버 정보 확인 실패: ${userId}`,
          error
        );


        await interaction.reply({
          content:
            `❎ <@${userId}> 멤버 정보를 확인하지 못해서 보정을 중단했습니다.\n` +
            '아직 아무 포인트도 지급하지 않았어요.',

          allowedMentions: {
            parse: [],
          },

          flags:
            MessageFlags.Ephemeral,
        });

        return;
      }


      if (member.roles.cache.has(ROLE_IDS.NEWBIE)) {
        newbieUserIds.push(userId);
      } else {
        helperUserIds.push(userId);
      }
    }


    /*
     * 실제 목표 시간 이상 활동했음을
     * 운영진이 확인하고 실행하는 명령어이므로
     * 목표시간까지 DB 기록을 보정합니다.
     */
    repairProgress.run(
      REQUIRED_SECONDS,
      REQUIRED_SECONDS,
      recruitmentId
    );


    // 자동 완료와 같은 트랜잭션을 사용해 역할별 지급과 중복 제한을 적용합니다.
    let result;


    try {
      result =
        completeNewbieParty(
          interaction.guildId,
          recruitmentId,
          { helperUserIds, newbieUserIds }
        );

    } catch (error) {
      console.error(
        `❌ [신입활동 보정] 구인 #${recruitmentId} 완료 처리 실패:`,
        error
      );


      await interaction.reply({
        content:
          '❎ 신입활동 보정 중 오류가 발생했습니다.\n' +
          '포인트 기록을 확인한 뒤 다시 시도해주세요.',

        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }


    if (
      result.code !==
      'COMPLETED'
    ) {
      await interaction.reply({
        content:
          `❎ 구인 #${recruitmentId}을 완료 처리하지 못했습니다.\n` +
          '이미 완료된 파티인지 확인해주세요.',

        flags:
          MessageFlags.Ephemeral,
      });

      return;
    }


    const promotedUserIds = await promoteAwardedNewbies(interaction.guild, result.awards);

    const lines = [
      '💚 **신입파티 활동 보정 완료**',
      '',
      `🎮 구인: **#${recruitmentId}**`,
      `⏱️ 인정 활동시간: **${RECRUIT_CONFIG.NEWBIE_MIN_VOICE_MINUTES}분**`,
      `👥 등록 참가자: **${memberIds.length}명**`,
      '',
    ];


    if (result.awards.length > 0) {
      lines.push(...result.awards.map(
        ({ userId, points }) => `💎 <@${userId}> **+${points}P** 지급`
      ));
    } else {
      lines.push('💎 포인트 지급 대상이 없습니다.');
    }

    if (result.dailyLimitUserIds.length > 0) {
      const mentions = result.dailyLimitUserIds.map((userId) => `<@${userId}>`).join(' ');
      lines.push(`🌱 오늘 이미 지급받아 제외: ${mentions}`);
    }

    if (promotedUserIds.length > 0) {
      const mentions = promotedUserIds.map((userId) => `<@${userId}>`).join(' ');
      lines.push(`🎉 ${mentions} **${RECRUIT_CONFIG.NEWBIE_PROMOTION_POINTS}P 달성!** 신입 → 멤버 자동등업 완료`);
    }

    lines.push(
      '',
      '✅ 신입활동 기록도 함께 저장되었습니다.',
      '✅ 같은 구인으로 다시 보정해도 중복 지급되지 않습니다.'
    );


    await interaction.reply({
      content:
        lines.join('\n'),

      allowedMentions: {
        parse: [],
      },

      flags:
        MessageFlags.Ephemeral,
    });


    console.log(
      `🛠️ [신입활동 보정] 구인 #${recruitmentId} · ` +
      `운영진 ${interaction.user.username} · ` +
      `포인트 지급: ${result.awards.map(({ userId, points }) => `${userId} +${points}P`).join(' / ') || '없음'}`
    );
  },
};