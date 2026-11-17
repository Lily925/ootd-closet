// Rule-based outfit recommender. No DOM in here: give it the weather and the
// closet, and it works out which items fit, what's missing, and why.
// Requires clothes-options.js.
window.OutfitRules = (function () {
  const { CATEGORIES, THICKNESSES, labelOf } = window.ClothesOptions;

  // Temperature rules from CLAUDE.md ("Recommendation rules"), by feels-like
  // temperature (°C), warmest first. A rule applies from `min` up to the next
  // warmer rule's `min`. "normal" in CLAUDE.md is 'medium' here.
  //   top/bottom/shoes: thicknesses that fit, best first. Dresses use `top`.
  //   outer.need: 'none' (leave it off), 'optional' (nice to have), 'required'.
  // CLAUDE.md only fixes the top and outer for most bands (and the bottom for
  // the two warmest), so the other values are sensible defaults.
  const RULES = [
    {
      min: 28, feel: '무더운 날씨', // thin top, thin bottom, no outer
      top: ['thin'], bottom: ['thin'], shoes: ['thin'],
      outer: { need: 'none' },
      tip: '민소매나 반팔, 반바지처럼 바람이 잘 통하는 옷이 좋아요.',
      examples: { top: '민소매, 반팔 티셔츠', bottom: '반바지, 린넨 바지', outer: '', shoes: '샌들' },
    },
    {
      min: 23, feel: '더운 날씨', // thin top, normal bottom
      top: ['thin'], bottom: ['medium'], shoes: ['thin', 'medium'],
      outer: { need: 'none' },
      tip: '반팔이나 얇은 셔츠에 면바지 정도면 충분해요.',
      examples: { top: '반팔 티셔츠, 얇은 셔츠', bottom: '면바지, 청바지', outer: '', shoes: '샌들, 스니커즈' },
    },
    {
      min: 17, feel: '선선한 날씨', // normal top, light outer optional
      top: ['medium'], bottom: ['medium'], shoes: ['medium'],
      outer: { need: 'optional', thickness: ['thin'] },
      tip: '맨투맨이나 얇은 니트가 좋고, 아침저녁엔 가디건 같은 얇은 겉옷이 있으면 좋아요.',
      examples: { top: '맨투맨, 얇은 니트', bottom: '청바지, 면바지', outer: '가디건', shoes: '스니커즈' },
    },
    {
      min: 12, feel: '쌀쌀한 날씨', // normal top, normal outer
      top: ['medium'], bottom: ['medium'], shoes: ['medium'],
      outer: { need: 'required', thickness: ['medium'] },
      tip: '자켓이나 야상 같은 겉옷이 필요해요.',
      examples: { top: '맨투맨, 니트', bottom: '청바지, 슬랙스', outer: '자켓, 야상', shoes: '스니커즈, 로퍼' },
    },
    {
      min: 9, feel: '꽤 추운 날씨', // normal/thick top, thick-ish outer
      top: ['medium', 'thick'], bottom: ['medium', 'thick'], shoes: ['medium', 'thick'],
      outer: { need: 'required', thickness: ['thick', 'medium'] },
      tip: '트렌치코트나 두툼한 자켓 안에 니트를 받쳐 입으세요.',
      examples: { top: '니트, 후드티', bottom: '청바지, 기모 바지', outer: '트렌치코트, 두툼한 자켓', shoes: '스니커즈, 부츠' },
    },
    {
      min: -Infinity, feel: '추운 날씨', // ≤8: thick top, thick outer
      top: ['thick'], bottom: ['thick', 'medium'], shoes: ['thick', 'medium'],
      outer: { need: 'required', thickness: ['thick'] },
      tip: '패딩이나 두꺼운 코트를 입고, 많이 추우면 목도리와 장갑도 챙기세요.',
      examples: { top: '두꺼운 니트, 기모 맨투맨', bottom: '기모 바지', outer: '패딩, 두꺼운 코트', shoes: '부츠' },
    },
  ];

  // On rainy days, shoes and outers with one of these words in a tag come first.
  // '비' has to be the whole tag, or '비즈니스' and '비치' would count as rain gear.
  const RAIN_TAG_EXACT = ['비'];
  const RAIN_TAG_WORDS = ['비옷', '우비', '우천', '장마', '레인', '방수', '장화', 'rain', 'waterproof'];
  const RAIN_CHANCE_PERCENT = 50;
  const STRONG_WIND_MS = 7;

  const THICKNESS_ORDER = THICKNESSES.map((t) => t.value);
  const THICKNESS_ADJECTIVE = { thin: '얇은', medium: '보통 두께', thick: '두꺼운' };
  const THICKNESS_REASON = { thin: '얇아서', medium: '두께가 적당해서', thick: '두꺼워서' };

  /** Picks the particle that follows `word`: josa('신발', '이', '가') → '이'. */
  function josa(word, withFinal, withoutFinal) {
    const code = word.charCodeAt(word.length - 1) - 0xac00;
    const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
    return hasFinal ? withFinal : withoutFinal;
  }

  const slotLabel = (slot) => labelOf(CATEGORIES, slot);

  function ruleFor(feelsLike) {
    return RULES.find((rule) => feelsLike >= rule.min);
  }

  /**
   * The items of one category that suit the rule. If none has a suitable
   * thickness, falls back to the closest thickness the closet does have.
   */
  function candidates(items, wanted, allowFallback) {
    if (items.length === 0) return { status: 'missing', items: [], wanted };

    const fitting = items.filter((item) => wanted.includes(item.thickness));
    if (fitting.length > 0) return { status: 'ok', items: fitting, wanted };
    if (!allowFallback) return { status: 'none-fitting', items: [], wanted };

    const distance = (item) => Math.min(...wanted.map((w) =>
      Math.abs(THICKNESS_ORDER.indexOf(item.thickness) - THICKNESS_ORDER.indexOf(w))));
    const closest = Math.min(...items.map(distance));
    return { status: 'fallback', items: items.filter((item) => distance(item) === closest), wanted };
  }

  function isRainy(weather) {
    const { lastHourMm, chancePercent } = weather.precipitation ?? {};
    return lastHourMm > 0 || chancePercent >= RAIN_CHANCE_PERCENT;
  }

  function isRainGear(item) {
    return (item.tags ?? []).some((tag) => {
      const text = tag.toLowerCase();
      return RAIN_TAG_EXACT.includes(text) || RAIN_TAG_WORDS.some((word) => text.includes(word));
    });
  }

  /** Narrows a slot to its rain gear, if it has any. Otherwise leaves it as it was. */
  function preferRainGear(slotPlan, items) {
    const rainGear = items.filter(isRainGear);
    if (rainGear.length === 0) return slotPlan;
    return { ...slotPlan, status: 'ok', items: rainGear, rain: true };
  }

  function weatherNotes(weather) {
    const notes = [];
    if (isRainy(weather)) {
      notes.push('비나 눈 소식이 있어요. 우산을 챙기고 젖어도 괜찮은 신발을 신으세요.');
    }
    if (weather.wind?.speed >= STRONG_WIND_MS) {
      notes.push('바람이 강해서 실제보다 더 춥게 느껴질 수 있어요.');
    }
    return notes;
  }

  /**
   * Works out everything about today's options: the rule, the candidates for
   * each slot, what's missing, and how many valid combinations there are.
   */
  function plan(weather, clothes) {
    // Rounded first, so the rule always matches the temperature people are shown.
    const feelsLike = Math.round(weather.feelsLike);
    const rule = ruleFor(feelsLike);
    const inCategory = (category) => clothes.filter((item) => item.category === category);

    const slots = {
      top: candidates(inCategory('top'), rule.top, true),
      bottom: candidates(inCategory('bottom'), rule.bottom, true),
      dress: candidates(inCategory('dress'), rule.top, true),
      shoes: candidates(inCategory('shoes'), rule.shoes, true),
    };
    if (rule.outer.need === 'none') {
      slots.outer = { status: 'skip', items: [], wanted: [] };
    } else {
      // An optional outer is only worth suggesting if it's actually light enough.
      slots.outer = candidates(inCategory('outer'), rule.outer.thickness, rule.outer.need === 'required');
    }

    // Rain: shoes made for rain beat the usual thickness choice, but a rain
    // outer only wins among outers warm enough for today.
    if (isRainy(weather)) {
      slots.shoes = preferRainGear(slots.shoes, inCategory('shoes'));
      slots.outer = preferRainGear(slots.outer, slots.outer.items);
    }

    // An outfit is either a top with a bottom, or a dress. A dress that's the
    // wrong thickness is only offered when there's no top-and-bottom to wear.
    const separates = ['top', 'bottom'].filter((slot) => slots[slot].items.length > 0);
    const hasDress = slots.dress.items.length > 0;
    const bases = [];
    if (separates.length === 2 || (separates.length > 0 && !hasDress)) bases.push(separates);
    if (hasDress && (slots.dress.status === 'ok' || separates.length < 2)) bases.push(['dress']);
    if (bases.length === 0) bases.push([]);

    const extras = ['outer', 'shoes'].filter((slot) => slots[slot].items.length > 0);
    const forms = bases.map((base) => [...base, ...extras]);
    const sizes = forms.map((form) => form.reduce((n, slot) => n * slots[slot].items.length, 1));
    const total = sizes.reduce((a, b) => a + b, 0);

    const missing = [];
    if (separates.length < 2 && !hasDress) {
      for (const slot of ['top', 'bottom']) {
        if (slots[slot].status === 'missing') missing.push(slot);
      }
    }
    if (rule.outer.need === 'required' && slots.outer.status === 'missing') missing.push('outer');
    if (slots.shoes.status === 'missing') missing.push('shoes');

    return {
      rule,
      feelsLike,
      slots,
      forms,
      sizes,
      total,
      missing,
      summary: `체감 온도 ${feelsLike}°C, ${rule.feel}예요. ${rule.tip}`,
      notes: weatherNotes(weather),
    };
  }

  function itemReason(slot, item, slotPlan, rule, feelsLike) {
    if (slotPlan.rain) {
      return slot === 'shoes'
        ? '비 소식이 있어서 비 오는 날에 신기 좋은 신발로 골랐어요.'
        : '비 소식이 있어서 비에 강한 아우터로 골랐어요.';
    }
    if (slotPlan.status === 'fallback') {
      const label = slotLabel(slot);
      return `${THICKNESS_ADJECTIVE[slotPlan.wanted[0]]} ${label}${josa(label, '이', '가')} 없어서 가장 비슷한 두께로 골랐어요.`;
    }
    if (slot === 'outer' && rule.outer.need === 'optional') {
      return '아침저녁엔 쌀쌀할 수 있으니 가볍게 걸칠 옷으로 챙기세요.';
    }
    return `${THICKNESS_REASON[item.thickness]} 체감 ${feelsLike}°C에 알맞아요.`;
  }

  function emptyReason(slot, slotPlan, rule) {
    const label = slotLabel(slot);
    if (slotPlan.status === 'skip') return `오늘은 ${label} 없이도 괜찮아요.`;
    if (slot === 'outer' && rule.outer.need === 'optional') {
      return `${THICKNESS_ADJECTIVE[rule.outer.thickness[0]]} 겉옷이 있으면 좋지만 없어도 괜찮아요.`;
    }
    const example = rule.examples[slot];
    return `옷장에 ${label}${josa(label, '이', '가')} 없어요.${example ? ` 추천: ${example}` : ''}`;
  }

  /**
   * Builds combination number `index` (0 ≤ index < plan.total) as a list of
   * cards, one per slot, each with the chosen item (or null) and a reason.
   */
  function combination(planned, index) {
    const { slots, forms, sizes, rule, feelsLike } = planned;

    let formIndex = 0;
    let rest = index;
    while (formIndex < forms.length - 1 && rest >= sizes[formIndex]) {
      rest -= sizes[formIndex];
      formIndex++;
    }

    // Read the remaining number as a mixed-radix number, one digit per slot.
    const chosen = {};
    for (const slot of forms[formIndex]) {
      const options = slots[slot].items;
      chosen[slot] = options[rest % options.length];
      rest = Math.floor(rest / options.length);
    }

    const shown = 'dress' in chosen ? ['dress', 'outer', 'shoes'] : ['top', 'bottom', 'outer', 'shoes'];
    return shown.map((slot) => {
      const item = chosen[slot] ?? null;
      const slotPlan = slots[slot];
      let state = slotPlan.status; // 'ok' or 'fallback' when there's an item
      if (!item) state = planned.missing.includes(slot) ? 'missing' : 'not-needed';
      return {
        slot,
        label: slotLabel(slot),
        item,
        state,
        reason: item ? itemReason(slot, item, slotPlan, rule, feelsLike) : emptyReason(slot, slotPlan, rule),
      };
    });
  }

  /** General advice for the categories the closet is missing. */
  function missingAdvice(planned) {
    const { missing, rule, feelsLike } = planned;
    const labels = missing.map(slotLabel);
    const last = labels[labels.length - 1];
    const list = `${labels.join(', ')}${josa(last, '이', '가')}`;
    const dressHint = missing.includes('top') || missing.includes('bottom')
      ? ' 상의와 하의 대신 원피스를 추가해도 돼요.'
      : '';
    const examples = missing.map((slot) => rule.examples[slot]).filter(Boolean).join(', ');
    const addHint = examples ? ` ${examples} 같은 옷을 추가하면 더 잘 맞는 코디를 추천해 드릴게요.` : '';
    return {
      title: `옷장에 ${list} 없어요`,
      advice: `체감 ${feelsLike}°C에는 ${rule.tip}${addHint}${dressHint}`,
    };
  }

  return { RULES, ruleFor, plan, combination, missingAdvice };
})();
