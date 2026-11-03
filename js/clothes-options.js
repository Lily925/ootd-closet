// The choices offered for each clothing attribute, shared by the form and the
// closet filters. The value is what gets stored; the label is what people see.
window.ClothesOptions = (function () {
  const CATEGORIES = [
    { value: 'top', label: '상의' },
    { value: 'bottom', label: '하의' },
    { value: 'outer', label: '아우터' },
    { value: 'dress', label: '원피스' },
    { value: 'shoes', label: '신발' },
    { value: 'accessory', label: '액세서리' },
  ];

  const COLORS = [
    { value: 'black', label: '블랙', hex: '#1a1a1a' },
    { value: 'white', label: '화이트', hex: '#ffffff' },
    { value: 'gray', label: '그레이', hex: '#9a9a9a' },
    { value: 'navy', label: '네이비', hex: '#1f2f5c' },
    { value: 'blue', label: '블루', hex: '#3b7dd8' },
    { value: 'green', label: '그린', hex: '#3e8e5a' },
    { value: 'yellow', label: '옐로', hex: '#f0c93a' },
    { value: 'beige', label: '베이지', hex: '#d9c7a5' },
    { value: 'brown', label: '브라운', hex: '#7a5230' },
    { value: 'red', label: '레드', hex: '#c8352b' },
    { value: 'pink', label: '핑크', hex: '#ee9fb8' },
    { value: 'purple', label: '퍼플', hex: '#7d55b5' },
    { value: 'other', label: '기타', hex: null },
  ];

  const THICKNESSES = [
    { value: 'thin', label: '얇음' },
    { value: 'medium', label: '보통' },
    { value: 'thick', label: '두꺼움' },
  ];

  function labelOf(options, value) {
    return options.find((option) => option.value === value)?.label ?? value;
  }

  return { CATEGORIES, COLORS, THICKNESSES, labelOf };
})();
