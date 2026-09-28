const {
  db
} = require('../database/db');

const {
  ROLE_IDS
} = require('../config/constants');


const PROCESSED_MARKER =
  '__PROCESSED__';


/*
 * 특정 월의 신입활동 순위를 가져옵니다.
 *
 * awardMonth 예:
 * 2026-08
 */
const selectMonthlyActivity =
  db.prepare(`
    SELECT
      user_id,
      COUNT(*) AS activity_count

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
      ) = ?

    GROUP BY user_id

    ORDER BY
      activity_count DESC,
      user_id ASC
  `);


/*
 * 해당 월 뉴비메이트 선정이
 * 이미 완료됐는지 확인합니다.
 */
const selectProcessedMarker =
  db.prepare(`
    SELECT 1

    FROM monthly_awards

    WHERE
      guild_id = ?
      AND award_month = ?
      AND user_id = ?
      AND award_complete = 1

    LIMIT 1
  `);


/*
 * 과거 뉴비메이트 수상자 전체입니다.
 *
 * 오래된 역할이 남아 있는 경우까지
 * 안전하게 회수하기 위해 사용합니다.
 */
const selectPreviousAwardUsers =
  db.prepare(`
    SELECT DISTINCT
      user_id

    FROM monthly_awards

    WHERE
      guild_id = ?
      AND user_id != ?
      AND award_complete = 1
  `);


/*
 * 실제 수상자를 기록합니다.
 */
const insertAward =
  db.prepare(`
    INSERT INTO monthly_awards (
      guild_id,
      award_month,
      user_id,
      activity_count,
      award_complete,
      awarded_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      1,
      datetime('now')
    )

    ON CONFLICT (
      guild_id,
      award_month,
      user_id
    )
    DO UPDATE SET
      activity_count =
        excluded.activity_count,

      award_complete = 1,

      awarded_at =
        datetime('now')
  `);


/*
 * 이 월의 선정 작업 자체가 끝났음을
 * 표시하는 내부 기록입니다.
 *
 * 활동자가 0명인 달도
 * 매번 다시 처리하지 않게 해줍니다.
 */
const insertProcessedMarker =
  db.prepare(`
    INSERT INTO monthly_awards (
      guild_id,
      award_month,
      user_id,
      activity_count,
      award_complete,
      awarded_at
    )
    VALUES (
      ?,
      ?,
      ?,
      0,
      1,
      datetime('now')
    )

    ON CONFLICT (
      guild_id,
      award_month,
      user_id
    )
    DO UPDATE SET
      award_complete = 1,
      awarded_at =
        datetime('now')
  `);


function getPreviousKoreanMonth() {
  /*
   * 현재 시각을 KST(+9)로 옮긴 뒤
   * UTC getter를 사용하면
   * 한국 날짜 기준으로 계산할 수 있습니다.
   */
  const koreanNow =
    new Date(
      Date.now() +
      9 * 60 * 60 * 1000
    );


  let year =
    koreanNow.getUTCFullYear();

  let month =
    koreanNow.getUTCMonth();


  /*
   * getUTCMonth():
   * 0 = 1월
   *
   * 현재 달 인덱스 자체가
   * 이전 달의 실제 월 숫자와 같습니다.
   *
   * 예:
   * 9월 → getUTCMonth() = 8
   * 이전 달 = 8월
   */
  if (
    month === 0
  ) {
    year -= 1;
    month = 12;
  }


  return (
    `${year}-` +
    `${String(month).padStart(2, '0')}`
  );
}


async function removeOldNewbieMateRoles(
  guild
) {
  const rows =
    selectPreviousAwardUsers.all(
      guild.id,
      PROCESSED_MARKER
    );


  for (
    const row of rows
  ) {
    try {
      const member =
        guild.members.cache.get(
          row.user_id
        ) ||
        await guild.members.fetch(
          row.user_id
        );


      if (
        member.roles.cache.has(
          ROLE_IDS.NEWBIE_MATE
        )
      ) {
        await member.roles.remove(
          ROLE_IDS.NEWBIE_MATE,
          '희낙이 월간 뉴비메이트 역할 갱신'
        );
      }

    } catch (error) {
      /*
       * 서버를 나간 멤버 등은
       * 조용히 건너뜁니다.
       */
      console.warn(
        `⚠️ [뉴비메이트] 기존 역할 회수 실패 또는 멤버 없음: ${row.user_id}`
      );
    }
  }
}


async function giveNewbieMateRole(
  guild,
  userId
) {
  const member =
    guild.members.cache.get(
      userId
    ) ||
    await guild.members.fetch(
      userId
    );


  if (
    !member.roles.cache.has(
      ROLE_IDS.NEWBIE_MATE
    )
  ) {
    await member.roles.add(
      ROLE_IDS.NEWBIE_MATE,
      '희낙이 월간 뉴비메이트 선정'
    );
  }


  return member;
}


async function processMonthlyNewbieMate(
  guild
) {
  const awardMonth =
    getPreviousKoreanMonth();


  /*
   * 이미 처리한 달이면
   * 아무것도 하지 않습니다.
   */
  const processed =
    selectProcessedMarker.get(
      guild.id,
      awardMonth,
      PROCESSED_MARKER
    );


  if (
    processed
  ) {
    return {
      code:
        'ALREADY_PROCESSED',

      awardMonth,
    };
  }


  const ranking =
    selectMonthlyActivity.all(
      guild.id,
      awardMonth
    );


  /*
   * 기존 뉴비메이트 역할은
   * 새 월간 선정 전에 모두 회수합니다.
   */
  await removeOldNewbieMateRoles(
    guild
  );


  /*
   * 지난달 신입활동 기록이 하나도 없는 경우
   */
  if (
    ranking.length === 0
  ) {
    insertProcessedMarker.run(
      guild.id,
      awardMonth,
      PROCESSED_MARKER
    );


    console.log(
      `🌱 [뉴비메이트] ${awardMonth} 활동 기록 없음`
    );


    return {
      code:
        'NO_ACTIVITY',

      awardMonth,

      winners:
        [],
    };
  }


  /*
   * 가장 높은 활동 횟수
   */
  const topCount =
    Number(
      ranking[0].activity_count
    );


  /*
   * 공동 1등 전원 선정
   */
  const winners =
    ranking.filter(
      (row) =>
        Number(
          row.activity_count
        ) === topCount
    );


  const awardedUsers = [];


  /*
   * 공동 1등 전원에게 역할 지급
   */
  for (
    const winner of winners
  ) {
    try {
      await giveNewbieMateRole(
        guild,
        winner.user_id
      );


      insertAward.run(
        guild.id,
        awardMonth,
        winner.user_id,
        topCount
      );


      awardedUsers.push({
        userId:
          winner.user_id,

        activityCount:
          topCount,
      });

    } catch (error) {
      /*
       * 한 명이라도 역할 지급 실패하면
       * 월 처리완료 마커를 남기지 않습니다.
       *
       * 다음 봇 실행 때 다시 시도할 수 있습니다.
       */
      console.error(
        `❌ [뉴비메이트] ${winner.user_id} 역할 지급 실패:`,
        error
      );


      return {
        code:
          'ROLE_UPDATE_FAILED',

        awardMonth,

        winners:
          awardedUsers,

        failedUserId:
          winner.user_id,

        error,
      };
    }
  }


  /*
   * 모든 역할 지급이 끝난 뒤에만
   * 이번 달 처리를 완료로 기록합니다.
   */
  insertProcessedMarker.run(
    guild.id,
    awardMonth,
    PROCESSED_MARKER
  );


  console.log(
    `🏆 [뉴비메이트] ${awardMonth} 선정 완료 · ${awardedUsers.length}명 · ${topCount}회`
  );


  return {
    code:
      'AWARDED',

    awardMonth,

    activityCount:
      topCount,

    winners:
      awardedUsers,
  };
}


module.exports = {
  getPreviousKoreanMonth,
  processMonthlyNewbieMate,
};