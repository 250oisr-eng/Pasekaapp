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

  window.PasekaHiveModel = { assemblyBoxChanges };
})();
