import { describe, expect, it } from "vitest";
import {
  availabilityRange,
  availableMinutes,
  crossesMidnight,
  dailyCapacityMinutes,
  DAY_LABELS,
  DAYS_MON_FIRST,
  downtimeMinutesWithin,
  findException,
  formatDayList,
  isDowntimeActive,
  isHHMM,
  isWorkingDay,
  overlapMinutes,
  parseHHMM,
  shiftGrossMinutes,
  shiftNetMinutes,
  shiftsOn,
  sortDaysMonFirst,
  validateShifts,
  weeklyCapacityMinutes,
  weeklySummary,
  workingDaysOf,
  type Calendar,
  type Shift,
} from "@/lib/calendar";

const IST = "Asia/Kolkata";
const MON_SAT = [1, 2, 3, 4, 5, 6];

const morning: Shift = { id: "s1", name: "Morning", startTime: "06:00", endTime: "14:00", daysOfWeek: MON_SAT, breakMinutes: 30 };
const evening: Shift = { id: "s2", name: "Evening", startTime: "14:00", endTime: "22:00", daysOfWeek: MON_SAT, breakMinutes: 30 };
const night: Shift = { id: "n", name: "Night", startTime: "22:00", endTime: "06:00", daysOfWeek: [1], breakMinutes: 60 };
const general: Shift = { id: "g", name: "Day", startTime: "09:00", endTime: "17:00", daysOfWeek: MON_SAT, breakMinutes: 60 };

const twoShifts: Calendar = { shifts: [morning, evening], exceptions: [] };

// 2026-09-05 is a Saturday; 2026-09-06 Sunday; 2026-09-07 Monday; 2026-09-08 Tuesday.
const MON = "2026-09-07";
const TUE = "2026-09-08";
const SUN = "2026-09-06";

describe("time helpers", () => {
  it("parseHHMM is re-exported and isHHMM guards", () => {
    expect(parseHHMM("22:00")).toBe(1320);
    expect(isHHMM("22:00")).toBe(true);
    expect(isHHMM("22:0")).toBe(false);
    expect(isHHMM(2200)).toBe(false);
  });

  it("gross/net minutes with break subtraction and midnight crossing", () => {
    expect(shiftGrossMinutes(morning)).toBe(480);
    expect(shiftNetMinutes(morning)).toBe(450);
    expect(shiftGrossMinutes(night)).toBe(480);
    expect(shiftNetMinutes(night)).toBe(420);
    expect(crossesMidnight(night)).toBe(true);
    expect(crossesMidnight(morning)).toBe(false);
    // end == start means a full 24 h shift, counted on the start day
    expect(shiftGrossMinutes({ startTime: "08:00", endTime: "08:00" })).toBe(1440);
    expect(crossesMidnight({ startTime: "08:00", endTime: "08:00" })).toBe(true);
    expect(shiftNetMinutes({ startTime: "09:00", endTime: "17:00", breakMinutes: 480 })).toBe(0);
    expect(shiftNetMinutes({ startTime: "09:00", endTime: "17:00", breakMinutes: 500 })).toBe(-20);
  });
});

describe("day helpers", () => {
  it("DAY_LABELS are indexed by JS weekday and DAYS_MON_FIRST is the display order", () => {
    expect(DAY_LABELS[0]).toBe("Sun");
    expect(DAY_LABELS[6]).toBe("Sat");
    expect(DAYS_MON_FIRST).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("sortDaysMonFirst de-duplicates and drops invalid values", () => {
    expect(sortDaysMonFirst([0, 6, 1, 1, 3])).toEqual([1, 3, 6, 0]);
    expect(sortDaysMonFirst([7, -1, 2.5, 2])).toEqual([2]);
    expect(sortDaysMonFirst([])).toEqual([]);
  });

  it("formatDayList renders ranges Monday-first", () => {
    expect(formatDayList(MON_SAT)).toBe("Mon–Sat");
    expect(formatDayList([1, 2, 3, 4, 5])).toBe("Mon–Fri");
    expect(formatDayList([1, 3, 5])).toBe("Mon, Wed, Fri");
    expect(formatDayList([1, 2, 3, 4, 5, 0])).toBe("Mon–Fri, Sun");
    expect(formatDayList([1, 2])).toBe("Mon, Tue");
    expect(formatDayList([6, 0])).toBe("Sat, Sun");
    expect(formatDayList([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(formatDayList([3])).toBe("Wed");
    expect(formatDayList([])).toBe("");
  });
});

describe("validateShifts", () => {
  it("accepts a valid two-shift calendar and adjacent shifts", () => {
    expect(validateShifts([morning, evening])).toEqual([]);
    expect(validateShifts([morning, night])).toEqual([]);
    expect(validateShifts([])).toEqual([]);
  });

  it("rejects net minutes ≤ 0 (break ≥ duration)", () => {
    const errs = validateShifts([{ ...general, breakMinutes: 480 }]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/"Day".*net working time must be greater than 0/);
    expect(validateShifts([{ ...general, breakMinutes: 600 }])[0]).toMatch(/net working time/);
  });

  it("rejects missing days, invalid days, invalid times and negative breaks", () => {
    expect(validateShifts([{ ...general, daysOfWeek: [] }])).toEqual(['"Day": select at least one day']);
    expect(validateShifts([{ ...general, daysOfWeek: [7] }])).toEqual([
      '"Day": days must be weekdays 0 (Sunday) to 6 (Saturday)',
      '"Day": select at least one day',
    ]);
    expect(validateShifts([{ ...general, startTime: "9:00" }])).toEqual(['"Day": start time must be in HH:MM format']);
    expect(validateShifts([{ ...general, endTime: "24:00" }])).toEqual(['"Day": end time must be in HH:MM format']);
    expect(validateShifts([{ ...general, breakMinutes: -5 }])).toEqual([
      '"Day": break minutes must be a whole number of 0 or more',
    ]);
    expect(validateShifts([{ ...general, name: "  " }])[0] ?? "").toBe("");
    expect(validateShifts([{ ...general, name: "  ", daysOfWeek: [] }])).toEqual(["Shift 1: select at least one day"]);
  });

  it("rejects overlapping shifts on the same day", () => {
    const late: Shift = { ...evening, id: "x", name: "Late", startTime: "13:00", endTime: "21:00" };
    const errs = validateShifts([morning, late]);
    expect(errs).toEqual(['"Morning" overlaps with "Late" on Monday']);
  });

  it("does not flag the same times on disjoint days", () => {
    const weekend: Shift = { ...morning, id: "w", name: "Weekend", daysOfWeek: [0] };
    expect(validateShifts([morning, weekend])).toEqual([]);
  });

  it("detects overlap across midnight (night shift running into the next morning)", () => {
    const earlyTue: Shift = { id: "e", name: "Early", startTime: "05:00", endTime: "13:00", daysOfWeek: [2], breakMinutes: 0 };
    const errs = validateShifts([night, earlyTue]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/"Night" overlaps with "Early"/);
    // A shift starting exactly when the night shift ends is fine.
    expect(validateShifts([night, { ...earlyTue, startTime: "06:00" }])).toEqual([]);
  });

  it("detects overlap across the Saturday → Sunday week wrap", () => {
    const satNight: Shift = { ...night, id: "sn", name: "Sat night", daysOfWeek: [6] };
    const sunEarly: Shift = { id: "se", name: "Sun early", startTime: "04:00", endTime: "08:00", daysOfWeek: [0], breakMinutes: 0 };
    expect(validateShifts([satNight, sunEarly])).toEqual(['"Sat night" overlaps with "Sun early" on Saturday']);
    expect(validateShifts([satNight, { ...sunEarly, daysOfWeek: [1] }])).toEqual([]);
  });

  it("skips the overlap check for shifts that already failed basic validation", () => {
    const broken: Shift = { ...morning, id: "b", name: "Broken", startTime: "nope" };
    expect(validateShifts([morning, broken])).toEqual(['"Broken": start time must be in HH:MM format']);
  });
});

describe("shiftsOn", () => {
  it("returns absolute UTC instances for a working weekday, sorted by start", () => {
    const inst = shiftsOn({ shifts: [evening, morning], exceptions: [] }, MON, IST);
    expect(inst.map((i) => i.shiftId)).toEqual(["s1", "s2"]);
    expect(inst[0].startsAt.toISOString()).toBe("2026-09-07T00:30:00.000Z");
    expect(inst[0].endsAt.toISOString()).toBe("2026-09-07T08:30:00.000Z");
    expect(inst[0]).toMatchObject({ name: "Morning", date: MON, grossMinutes: 480, breakMinutes: 30, netMinutes: 450 });
    expect(inst[1].startsAt.toISOString()).toBe("2026-09-07T08:30:00.000Z");
    expect(inst[1].endsAt.toISOString()).toBe("2026-09-07T16:30:00.000Z");
  });

  it("returns nothing on a non-working weekday", () => {
    expect(shiftsOn(twoShifts, SUN, IST)).toEqual([]);
  });

  it("counts a midnight-crossing shift on its start day only", () => {
    const cal: Calendar = { shifts: [night], exceptions: [] };
    const mon = shiftsOn(cal, MON, IST);
    expect(mon).toHaveLength(1);
    expect(mon[0].startsAt.toISOString()).toBe("2026-09-07T16:30:00.000Z"); // Mon 22:00 IST
    expect(mon[0].endsAt.toISOString()).toBe("2026-09-08T00:30:00.000Z"); // Tue 06:00 IST
    expect(mon[0].netMinutes).toBe(420);
    expect(mon[0].date).toBe(MON);
    expect(shiftsOn(cal, TUE, IST)).toEqual([]);
  });

  it("a non-working exception removes all shifts (string or Date exception dates)", () => {
    expect(shiftsOn({ ...twoShifts, exceptions: [{ date: MON, isWorking: false, note: "Holiday" }] }, MON, IST)).toEqual([]);
    expect(
      shiftsOn({ ...twoShifts, exceptions: [{ date: new Date("2026-09-07T00:00:00.000Z"), isWorking: false }] }, MON, IST),
    ).toEqual([]);
    // Other days are unaffected.
    expect(shiftsOn({ ...twoShifts, exceptions: [{ date: MON, isWorking: false }] }, TUE, IST)).toHaveLength(2);
  });

  it("a working exception on Sunday runs ALL of the calendar's shifts (Sunday overtime)", () => {
    const inst = shiftsOn({ ...twoShifts, exceptions: [{ date: SUN, isWorking: true, note: "Overtime" }] }, SUN, IST);
    expect(inst.map((i) => i.shiftId)).toEqual(["s1", "s2"]);
    expect(inst[0].startsAt.toISOString()).toBe("2026-09-06T00:30:00.000Z");
    // A night shift that only runs Mondays also runs on the working-exception Sunday.
    const withNight = shiftsOn({ shifts: [morning, night], exceptions: [{ date: SUN, isWorking: true }] }, SUN, IST);
    expect(withNight.map((i) => i.shiftId)).toEqual(["s1", "n"]);
  });

  it("uses the calendar timezone (DST-aware zones)", () => {
    const berlin = shiftsOn({ shifts: [general], exceptions: [] }, "2026-07-06", "Europe/Berlin");
    expect(berlin[0].startsAt.toISOString()).toBe("2026-07-06T07:00:00.000Z");
    expect(berlin[0].netMinutes).toBe(420);
  });

  it("findException / isWorkingDay / workingDaysOf", () => {
    const cal: Calendar = { ...twoShifts, exceptions: [{ date: MON, isWorking: false }, { date: SUN, isWorking: true }] };
    expect(findException(cal, MON)?.isWorking).toBe(false);
    expect(findException(cal, TUE)).toBeNull();
    expect(isWorkingDay(cal, MON)).toBe(false);
    expect(isWorkingDay(cal, SUN)).toBe(true);
    expect(isWorkingDay(cal, TUE)).toBe(true);
    expect(isWorkingDay(twoShifts, SUN)).toBe(false);
    expect(workingDaysOf(twoShifts)).toEqual(MON_SAT);
    expect(workingDaysOf({ shifts: [night, { ...morning, daysOfWeek: [0] }] })).toEqual([1, 0]);
  });
});

describe("capacity", () => {
  it("dailyCapacityMinutes / weeklyCapacityMinutes", () => {
    expect(dailyCapacityMinutes(twoShifts)).toBe(900);
    expect(dailyCapacityMinutes([morning, evening])).toBe(900);
    expect(weeklyCapacityMinutes(twoShifts)).toBe(5400);
    expect(dailyCapacityMinutes({ shifts: [general] })).toBe(420);
    expect(weeklyCapacityMinutes({ shifts: [general] })).toBe(2520);
    expect(dailyCapacityMinutes({ shifts: [] })).toBe(0);
    // Invalid (negative net) shifts contribute 0 rather than reducing capacity.
    expect(dailyCapacityMinutes({ shifts: [{ ...general, breakMinutes: 600 }] })).toBe(0);
  });

  it("weeklySummary", () => {
    expect(weeklySummary(twoShifts)).toBe("Mon–Sat · 2 shifts · 900 min/day · 5,400 min/week");
    expect(weeklySummary({ shifts: [general] })).toBe("Mon–Sat · 1 shift · 420 min/day · 2,520 min/week");
    expect(weeklySummary({ shifts: [{ ...general, daysOfWeek: [1, 2, 3, 4, 5] }] })).toBe(
      "Mon–Fri · 1 shift · 420 min/day · 2,100 min/week",
    );
    expect(weeklySummary({ shifts: [] })).toBe("No shifts");
  });
});

describe("overlapMinutes / downtimeMinutesWithin", () => {
  const s = new Date("2026-09-07T00:30:00.000Z");
  const e = new Date("2026-09-07T08:30:00.000Z");

  it("computes half-open overlaps", () => {
    expect(overlapMinutes(s, e, "2026-09-07T02:30:00.000Z", "2026-09-07T06:30:00.000Z")).toBe(240);
    expect(overlapMinutes(s, e, "2026-09-06T20:00:00.000Z", "2026-09-07T01:30:00.000Z")).toBe(60);
    expect(overlapMinutes(s, e, "2026-09-07T08:00:00.000Z", "2026-09-07T12:00:00.000Z")).toBe(30);
    expect(overlapMinutes(s, e, "2026-09-06T00:00:00.000Z", "2026-09-08T00:00:00.000Z")).toBe(480);
    expect(overlapMinutes(s, e, "2026-09-07T08:30:00.000Z", "2026-09-07T09:30:00.000Z")).toBe(0);
    expect(overlapMinutes(s, e, "2026-09-07T10:00:00.000Z", "2026-09-07T11:00:00.000Z")).toBe(0);
    expect(overlapMinutes(s, e, s.getTime(), e.getTime())).toBe(480);
    expect(overlapMinutes(s, e, "garbage", e)).toBe(0);
  });

  it("unions overlapping downtime windows so they are not double counted", () => {
    const windows = [
      { startsAt: "2026-09-07T02:00:00.000Z", endsAt: "2026-09-07T04:00:00.000Z" },
      { startsAt: "2026-09-07T03:00:00.000Z", endsAt: "2026-09-07T05:00:00.000Z" },
      { startsAt: "2026-09-07T07:00:00.000Z", endsAt: "2026-09-07T12:00:00.000Z" },
      { startsAt: "2026-09-08T00:00:00.000Z", endsAt: "2026-09-08T01:00:00.000Z" },
    ];
    // 02:00–05:00 (180) + 07:00–08:30 (90) = 270
    expect(downtimeMinutesWithin(s, e, windows)).toBe(270);
    expect(downtimeMinutesWithin(s, e, [])).toBe(0);
    expect(downtimeMinutesWithin(s, e, [{ startsAt: "bad", endsAt: "worse" }])).toBe(0);
  });

  it("isDowntimeActive is startsAt ≤ now < endsAt", () => {
    const w = { startsAt: "2026-09-07T02:00:00.000Z", endsAt: "2026-09-07T04:00:00.000Z" };
    expect(isDowntimeActive(w, new Date("2026-09-07T02:00:00.000Z"))).toBe(true);
    expect(isDowntimeActive(w, new Date("2026-09-07T03:59:59.000Z"))).toBe(true);
    expect(isDowntimeActive(w, new Date("2026-09-07T04:00:00.000Z"))).toBe(false);
    expect(isDowntimeActive(w, new Date("2026-09-07T01:59:59.000Z"))).toBe(false);
  });
});

describe("availableMinutes", () => {
  const eff100 = { efficiencyPercent: 100 };

  it("without downtime at 100 % equals the net minutes", () => {
    const day = availableMinutes(eff100, twoShifts, [], MON, IST);
    expect(day.isWorking).toBe(true);
    expect(day.weekday).toBe(1);
    expect(day.exception).toBeNull();
    expect(day.shifts.map((s) => s.availableMinutes)).toEqual([450, 450]);
    expect(day).toMatchObject({ totalNet: 900, totalEffective: 900, totalDowntime: 0, totalAvailable: 900 });
  });

  it("scales by efficiency", () => {
    const day = availableMinutes({ efficiencyPercent: 85 }, twoShifts, [], MON, IST);
    // round(450 × 0.85) = round(382.5) = 383 per shift
    expect(day.shifts.map((s) => s.effectiveMinutes)).toEqual([383, 383]);
    expect(day.totalAvailable).toBe(766);
    expect(day.totalNet).toBe(900);
    const boosted = availableMinutes({ efficiencyPercent: 120 }, { shifts: [general] }, [], MON, IST);
    expect(boosted.totalAvailable).toBe(504);
    // Nonsense efficiency falls back to 100 %.
    expect(availableMinutes({ efficiencyPercent: 0 }, twoShifts, [], MON, IST).totalAvailable).toBe(900);
    expect(availableMinutes({ efficiencyPercent: Number.NaN }, twoShifts, [], MON, IST).efficiencyPercent).toBe(100);
  });

  it("subtracts downtime overlapping a shift (maintenance 08:00–12:00 IST on Monday)", () => {
    const maintenance = {
      id: "d1",
      startsAt: new Date("2026-09-07T02:30:00.000Z"), // 08:00 IST
      endsAt: new Date("2026-09-07T06:30:00.000Z"), // 12:00 IST
      type: "MAINTENANCE",
    };
    const day = availableMinutes(eff100, twoShifts, [maintenance], MON, IST);
    expect(day.shifts[0]).toMatchObject({ shiftId: "s1", downtimeMinutes: 240, availableMinutes: 210 });
    expect(day.shifts[1]).toMatchObject({ shiftId: "s2", downtimeMinutes: 0, availableMinutes: 450 });
    expect(day).toMatchObject({ totalDowntime: 240, totalAvailable: 660 });
    // The same window does not touch Tuesday.
    expect(availableMinutes(eff100, twoShifts, [maintenance], TUE, IST).totalDowntime).toBe(0);
  });

  it("splits downtime that spans two shifts and applies efficiency before subtracting", () => {
    const breakdown = { startsAt: "2026-09-07T07:30:00.000Z", endsAt: "2026-09-07T09:30:00.000Z" }; // 13:00–15:00 IST
    const day = availableMinutes({ efficiencyPercent: 80 }, twoShifts, [breakdown], MON, IST);
    expect(day.shifts.map((s) => s.downtimeMinutes)).toEqual([60, 60]);
    // round(450 × 0.8) = 360 − 60 = 300 each
    expect(day.shifts.map((s) => s.availableMinutes)).toEqual([300, 300]);
    expect(day.totalAvailable).toBe(600);
  });

  it("never goes below 0 when downtime covers the whole shift", () => {
    const whole = { startsAt: "2026-09-06T18:30:00.000Z", endsAt: "2026-09-07T18:30:00.000Z" }; // all Monday IST
    const day = availableMinutes({ efficiencyPercent: 90 }, twoShifts, [whole], MON, IST);
    expect(day.shifts.map((s) => s.downtimeMinutes)).toEqual([480, 480]);
    expect(day.shifts.map((s) => s.availableMinutes)).toEqual([0, 0]);
    expect(day.totalAvailable).toBe(0);
  });

  it("ignores downtime outside the shifts", () => {
    const night = { startsAt: "2026-09-07T17:00:00.000Z", endsAt: "2026-09-07T18:00:00.000Z" }; // 22:30–23:30 IST
    expect(availableMinutes(eff100, twoShifts, [night], MON, IST).totalDowntime).toBe(0);
  });

  it("returns a non-working day for holidays and weekends", () => {
    const holiday = availableMinutes(eff100, { ...twoShifts, exceptions: [{ date: MON, isWorking: false, note: "Diwali" }] }, [], MON, IST);
    expect(holiday.isWorking).toBe(false);
    expect(holiday.exception).toEqual({ date: MON, isWorking: false, note: "Diwali" });
    expect(holiday.shifts).toEqual([]);
    expect(holiday.totalAvailable).toBe(0);
    const sunday = availableMinutes(eff100, twoShifts, [], SUN, IST);
    expect(sunday.isWorking).toBe(false);
    expect(sunday.totalNet).toBe(0);
  });

  it("Sunday overtime exception with downtime", () => {
    const cal: Calendar = { ...twoShifts, exceptions: [{ date: SUN, isWorking: true, note: "Overtime" }] };
    const dt = { startsAt: "2026-09-06T00:30:00.000Z", endsAt: "2026-09-06T01:30:00.000Z" }; // 06:00–07:00 IST Sun
    const day = availableMinutes(eff100, cal, [dt], SUN, IST);
    expect(day.isWorking).toBe(true);
    expect(day.shifts.map((s) => s.availableMinutes)).toEqual([390, 450]);
    expect(day.totalAvailable).toBe(840);
  });

  it("counts downtime against a midnight-crossing shift on its start day", () => {
    const cal: Calendar = { shifts: [night], exceptions: [] };
    const dt = { startsAt: "2026-09-07T22:00:00.000Z", endsAt: "2026-09-08T02:00:00.000Z" }; // Tue 03:30–07:30 IST
    const day = availableMinutes(eff100, cal, [dt], MON, IST);
    // shift ends Tue 00:30Z → overlap 22:00Z–00:30Z = 150 min
    expect(day.shifts[0].downtimeMinutes).toBe(150);
    expect(day.shifts[0].availableMinutes).toBe(270);
  });

  it("availabilityRange yields one entry per day", () => {
    const range = availabilityRange(eff100, twoShifts, [], "2026-09-05", 7, IST);
    expect(range.map((d) => d.date)).toEqual([
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
    ]);
    expect(range.map((d) => d.isWorking)).toEqual([true, false, true, true, true, true, true]);
    expect(range.reduce((s, d) => s + d.totalAvailable, 0)).toBe(5400);
  });
});
