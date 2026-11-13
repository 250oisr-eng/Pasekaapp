(() => {
  function assemblyBoxChanges(from, to) {
    const before = from?.boxes || [];
    const after = to?.boxes || [];
    const added = after.filter(box => !before.includes(box));
    const removed = before.filter(box => !after.includes(box));
    const moved = [];
    if (from?.mode === 'winter' && to?.mode === 'winter') {
      const oldOrder = from.winterOrder || before;
      const newOrder = to.winterOrder || after;
      newOrder.forEach((box, index) => {
        const oldIndex = oldOrder.indexOf(box);
        if (oldIndex >= 0 && oldIndex !== index) {
          moved.push({ box, from: oldIndex + 1, to: index + 1 });
        }
      });
    }
    return { added, removed, moved };
  }

  function inspectFrameInventoryIntegrity(state) {
    const errors = [];
    const seen = new Map();
    const required = Number(state?.meta?.schemaVersion) >= 4;
    const add = (code, details) => errors.push({ code, details });
    for (const [hiveId, layout] of Object.entries(state?.layouts || {})) {
      if (!layout || typeof layout !== 'object') continue;
      const groups = [
        ...Object.entries(layout.boxes || {}).map(([box, value]) => ({ box, frames: value?.frames })),
        ...(Array.isArray(layout.honeyFrames)
          ? layout.honeyFrames.map((frames, index) => ({ box: 'H' + (index + 1), frames }))
          : [])
      ];
      for (const group of groups) {
        const frames = Array.isArray(group.frames) ? group.frames : [];
        for (let position = 0; position < frames.length; position++) {
          const frame = frames[position];
          const number = String(frame?.inventoryNumber || '');
          if (!number) {
            if (required) add('frame_inventory_number_missing', {
              hiveId, box: group.box, position: position + 1, frameId: frame?.frameId || null
            });
            continue;
          }
          if (!/^\d{6}$/.test(number)) {
            add('invalid_frame_inventory_number', {
              hiveId, box: group.box, position: position + 1, inventoryNumber: number
            });
            continue;
          }
          if (seen.has(number)) {
            add('duplicate_frame_inventory_number', {
              inventoryNumber: number,
              first: seen.get(number),
              duplicate: { hiveId, box: group.box, position: position + 1 }
            });
          } else {
            seen.set(number, { hiveId, box: group.box, position: position + 1 });
          }
        }
      }
    }
    return errors;
  }

  window.PasekaHiveModel = { assemblyBoxChanges, inspectFrameInventoryIntegrity };
})();
