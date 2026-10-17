// 메인 화면과 등록 화면이 같은 옷 카드, 페이지 나누기, 정보 수정 기능을 씁니다.
const PAGE_SIZE = 10;
const GARMENT_TYPES = [
  { id: 1, name: '상의 외투' },
  { id: 2, name: '크롭 티셔츠' },
  { id: 3, name: '원피스' },
  { id: 4, name: '점퍼' },
  { id: 5, name: '바지' }
];
const GENDER_OPTIONS = [
  { id: 'unknown', name: '모름' },
  { id: 'male', name: '남성용' },
  { id: 'female', name: '여성용' },
  { id: 'unisex', name: '공용' }
];

// onOpen 을 주면 옷 카드를 눌렀을 때 그 옷의 상세 창을 열어요. (주지 않으면 예전처럼 동작)
export function createGarmentCloset({ list, status, pagination, onOpen }) {
  let garments = [];
  let currentPage = 0;

  async function reload() {
    status.textContent = '옷 목록을 불러오고 있어요.';
    list.replaceChildren();
    pagination.replaceChildren();
    try {
      const response = await fetch('/api/garments');
      const result = await response.json().catch(() => []);
      if (!response.ok) throw new Error(result.error || '옷 목록을 불러오지 못했어요.');
      garments = Array.isArray(result) ? result : [];
      currentPage = Math.min(currentPage, Math.max(0, Math.ceil(garments.length / PAGE_SIZE) - 1));
      render();
    } catch (error) {
      status.textContent = error.message || '옷장 서버에 연결하지 못했어요.';
    }
  }

  function render() {
    list.replaceChildren();
    if (!garments.length) {
      status.textContent = '아직 등록한 옷이 없어요. 첫 번째 옷을 등록해 볼까요?';
      pagination.replaceChildren();
      return;
    }
    const pageCount = Math.ceil(garments.length / PAGE_SIZE);
    const firstIndex = currentPage * PAGE_SIZE;
    const visible = garments.slice(firstIndex, firstIndex + PAGE_SIZE);
    status.textContent = `옷 ${garments.length}벌 중 ${firstIndex + 1}~${firstIndex + visible.length}벌을 보고 있어요.`;
    for (const garment of visible) list.append(createCard(garment));
    renderPagination(pageCount);
  }

  function createCard(garment) {
    const card = document.createElement('article');
    card.className = 'school-closet-card';
    const image = document.createElement('img');
    image.alt = `${garment.name} 사진`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = 200;
    image.height = 200;
    let showingOriginal = false;
    const togglePhoto = document.createElement('button');
    togglePhoto.type = 'button';
    togglePhoto.className = 'closet-secondary-action';
    togglePhoto.textContent = '배경 포함 사진 보기';

    function showCleanPhoto() {
      const id = encodeURIComponent(garment.id);
      const choices = [
        `/api/garments/${id}/thumbnail?v=image-priority-1`,
        `/api/garments/${id}/closet-photo`,
        `/api/garments/${id}/photo`
      ];
      let choice = 0;
      image.onerror = () => {
        choice += 1;
        if (choice < choices.length) image.src = choices[choice];
        else image.onerror = null;
      };
      image.src = choices[choice];
    }

    togglePhoto.addEventListener('click', () => {
      showingOriginal = !showingOriginal;
      togglePhoto.textContent = showingOriginal ? '옷만 보기' : '배경 포함 사진 보기';
      image.onerror = null;
      if (showingOriginal) image.src = `/api/garments/${encodeURIComponent(garment.id)}/photo`;
      else showCleanPhoto();
    });
    showCleanPhoto();

    const title = document.createElement('strong');
    title.textContent = garment.name;
    const kind = document.createElement('p');
    kind.textContent = garment.garmentTypeName || garment.category || '옷';
    const size = document.createElement('p');
    size.textContent = `길이 ${garment.lengthCm}cm · 너비 ${garment.widthCm}cm`;
    const actions = document.createElement('div');
    actions.className = 'closet-card-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'closet-edit-action';
    edit.textContent = '정보 수정';
    edit.addEventListener('click', () => openEditDialog(garment));
    actions.append(togglePhoto, edit);
    card.append(image, title, kind, size, actions);
    if (typeof onOpen === 'function') {
      card.classList.add('is-openable');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${garment.name} 자세히 보기`);
      const open = (event) => { if (!event.target.closest('.closet-card-actions')) onOpen(garment); };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (event) => { if ((event.key === 'Enter' || event.key === ' ') && event.target === card) { event.preventDefault(); onOpen(garment); } });
    }
    return card;
  }

  function renderPagination(pageCount) {
    pagination.replaceChildren();
    if (pageCount <= 1) return;
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.textContent = '이전';
    previous.disabled = currentPage === 0;
    previous.addEventListener('click', () => { currentPage -= 1; render(); });
    const label = document.createElement('span');
    label.textContent = `${currentPage + 1} / ${pageCount} 페이지`;
    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = '다음';
    next.disabled = currentPage >= pageCount - 1;
    next.addEventListener('click', () => { currentPage += 1; render(); });
    pagination.append(previous, label, next);
  }

  function openEditDialog(garment) {
    const dialog = document.createElement('dialog');
    dialog.className = 'closet-edit-dialog';
    const form = document.createElement('form');
    form.className = 'closet-edit-form';
    const heading = document.createElement('h2');
    heading.textContent = '옷 정보를 고쳐요';
    const help = document.createElement('p');
    help.textContent = '모름으로 되어 있는 정보도 여기서 바꿀 수 있어요.';
    const fields = document.createElement('div');
    fields.className = 'closet-edit-fields';
    const name = addInput(fields, '옷 이름', 'name', 'text', garment.name, 60);
    const type = addSelect(fields, '옷 종류', 'garmentTypeId', GARMENT_TYPES, garment.garmentTypeId);
    const gender = addSelect(fields, '누가 입나요?', 'gender', GENDER_OPTIONS, garment.gender || 'unknown');
    const color = addInput(fields, '색깔', 'colorName', 'text', garment.colorName, 30);
    const length = addInput(fields, '길이(cm)', 'lengthCm', 'number', garment.lengthCm, null);
    const width = addInput(fields, '너비(cm)', 'widthCm', 'number', garment.widthCm, null);
    for (const input of [length, width]) {
      input.min = '1';
      input.max = '300';
      input.step = '0.1';
    }
    const message = document.createElement('p');
    message.className = 'closet-edit-message';
    message.setAttribute('role', 'status');
    const buttons = document.createElement('div');
    buttons.className = 'closet-edit-buttons';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '취소';
    cancel.addEventListener('click', () => dialog.close());
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = '저장';
    buttons.append(cancel, save);
    form.append(heading, help, fields, message, buttons);
    dialog.append(form);
    document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      save.disabled = true;
      message.textContent = '수정한 정보를 저장하고 있어요.';
      const garmentTypeId = Number(type.value);
      const payload = {
        name: name.value.trim(), garmentTypeId,
        category: garmentTypeId === 3 ? 'dress' : garmentTypeId === 5 ? 'pants' : 'top',
        gender: gender.value, colorName: color.value.trim(),
        lengthCm: Number(length.value), widthCm: Number(width.value)
      };
      try {
        const response = await fetch(`/api/garments/${encodeURIComponent(garment.id)}/update`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || '정보를 저장하지 못했어요.');
        dialog.close();
        await reload();
      } catch (error) {
        message.textContent = error.message || '저장 서버에 연결하지 못했어요.';
      } finally {
        save.disabled = false;
      }
    });
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  return { reload };
}

function addInput(parent, labelText, name, type, value, maxLength) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.name = name;
  input.type = type;
  input.value = value ?? '';
  input.required = true;
  if (maxLength) input.maxLength = maxLength;
  label.append(input);
  parent.append(label);
  return input;
}

function addSelect(parent, labelText, name, choices, value) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const select = document.createElement('select');
  select.name = name;
  select.required = true;
  for (const choice of choices) {
    const option = document.createElement('option');
    option.value = choice.id;
    option.textContent = choice.name;
    option.selected = String(choice.id) === String(value);
    select.append(option);
  }
  label.append(select);
  parent.append(label);
  return select;
}
