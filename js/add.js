// add.html: saves a new item, then clears the form so the next one can be added.
(function () {
  window.ClothesForm.mount(document.getElementById('add-form'), {
    onSaved(saved, { reset, status }) {
      reset();
      status.textContent = `‘${saved.name}’을(를) 저장했어요. `;
      const link = document.createElement('a');
      link.href = 'closet.html';
      link.textContent = '옷장 보기';
      status.append(link);
    },
  });
})();
