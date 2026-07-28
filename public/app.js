document.addEventListener('DOMContentLoaded', () => {
  // State Variables
  let searchType = 'seat'; // 'seat' or 'name'
  let currentPage = 1;
  let currentLimit = 20;
  let searchDebounceTimer = null;
  let currentResults = [];

  // DOM Elements
  const themeToggleBtn = document.getElementById('themeToggle');
  const searchTabs = document.querySelectorAll('.search-tab');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const searchHint = document.getElementById('searchHint');
  const limitSelect = document.getElementById('limitSelect');

  // Stats Elements
  const statTotal = document.getElementById('statTotal');
  const statMax = document.getElementById('statMax');
  const statAvg = document.getElementById('statAvg');

  // UI States & Results
  const resultsCountBadge = document.getElementById('resultsCountBadge');
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  const noResultsState = document.getElementById('noResultsState');
  const tableWrapper = document.getElementById('tableWrapper');
  const resultsTableBody = document.getElementById('resultsTableBody');

  // Pagination
  const pagination = document.getElementById('pagination');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  const pageInfo = document.getElementById('pageInfo');

  // Modal
  const studentModal = document.getElementById('studentModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalName = document.getElementById('modalName');
  const modalSeat = document.getElementById('modalSeat');
  const modalDegree = document.getElementById('modalDegree');
  const modalPercent = document.getElementById('modalPercent');
  const modalStatus = document.getElementById('modalStatus');
  const printModalBtn = document.getElementById('printModalBtn');
  const copyModalBtn = document.getElementById('copyModalBtn');

  // Initialize App
  initApp();

  function initApp() {
    loadStats();
    setupEventListeners();
  }

  // Theme Toggle
  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    themeToggleBtn.innerHTML = newTheme === 'dark' 
      ? '<i class="fa-solid fa-moon"></i>' 
      : '<i class="fa-solid fa-sun"></i>';
  });

  // Fetch System Stats
  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success) {
        statTotal.textContent = data.stats.totalStudents.toLocaleString('ar-EG');
        statMax.textContent = data.stats.maxDegree;
        statAvg.textContent = data.stats.avgDegree + ' درجة';
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  // Event Listeners
  function setupEventListeners() {
    // Search Tabs Switch
    searchTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        searchTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        searchType = tab.getAttribute('data-type');
        currentPage = 1;

        if (searchType === 'seat') {
          searchInput.placeholder = 'أدخل رقم الجلوس هنا... (مثال: 2001970)';
          searchHint.innerHTML = '<i class="fa-solid fa-circle-info"></i> يمكنك إدخال رقم الجلوس كاملاً أو بدايته للبحث الفوري.';
        } else {
          searchInput.placeholder = 'أدخل اسم الطالب ثلاثي أو رباعي... (مثال: أحمد محمود)';
          searchHint.innerHTML = '<i class="fa-solid fa-circle-info"></i> يمكنك البحث باستخدام جزء من الاسم أو الكلمات الرئيسية.';
        }

        searchInput.value = '';
        toggleClearBtn();
        resetToEmptyState();
        searchInput.focus();
      });
    });

    // Input Typing (Debounced Instant Search)
    searchInput.addEventListener('input', () => {
      toggleClearBtn();
      clearTimeout(searchDebounceTimer);
      
      const val = searchInput.value.trim();
      if (!val) {
        resetToEmptyState();
        return;
      }

      // Instant search debounced
      searchDebounceTimer = setTimeout(() => {
        currentPage = 1;
        executeSearch();
      }, 350);
    });

    // Search Button Click & Enter Key
    searchBtn.addEventListener('click', () => {
      currentPage = 1;
      executeSearch();
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        currentPage = 1;
        executeSearch();
      }
    });

    // Clear Search Input
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      toggleClearBtn();
      resetToEmptyState();
      searchInput.focus();
    });

    // Limit Select Change
    limitSelect.addEventListener('change', () => {
      currentLimit = parseInt(limitSelect.value, 10);
      currentPage = 1;
      if (searchInput.value.trim()) {
        executeSearch();
      }
    });

    // Pagination Click
    prevPageBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        executeSearch();
      }
    });

    nextPageBtn.addEventListener('click', () => {
      currentPage++;
      executeSearch();
    });

    // Modal Close
    closeModalBtn.addEventListener('click', closeModal);
    studentModal.addEventListener('click', (e) => {
      if (e.target === studentModal) closeModal();
    });

    // Copy Result
    copyModalBtn.addEventListener('click', () => {
      const textToCopy = `نتيجة الثانوية العامة:
الاسم: ${modalName.textContent}
رقم الجلوس: ${modalSeat.textContent}
المجموع الكلي: ${modalDegree.textContent}
النسبة المئوية: ${modalPercent.textContent}
الحالة: ${modalStatus.textContent}`;

      navigator.clipboard.writeText(textToCopy).then(() => {
        copyModalBtn.innerHTML = '<i class="fa-solid fa-check"></i> تم النسخ!';
        setTimeout(() => {
          copyModalBtn.innerHTML = '<i class="fa-solid fa-copy"></i> نسخ النتيجة';
        }, 2000);
      });
    });

    // Print Result
    printModalBtn.addEventListener('click', () => {
      window.print();
    });
  }

  function toggleClearBtn() {
    if (searchInput.value.length > 0) {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }
  }

  function resetToEmptyState() {
    emptyState.classList.remove('hidden');
    loadingState.classList.add('hidden');
    noResultsState.classList.add('hidden');
    tableWrapper.classList.add('hidden');
    pagination.classList.add('hidden');
    resultsCountBadge.textContent = '0 نتيجة';
  }

  // Execute Search API Request
  async function executeSearch() {
    const query = searchInput.value.trim();
    if (!query) {
      resetToEmptyState();
      return;
    }

    // Show Loading State
    emptyState.classList.add('hidden');
    noResultsState.classList.add('hidden');
    tableWrapper.classList.add('hidden');
    pagination.classList.add('hidden');
    loadingState.classList.remove('hidden');

    try {
      const url = `/api/search?q=${encodeURIComponent(query)}&type=${searchType}&page=${currentPage}&limit=${currentLimit}`;
      const res = await fetch(url);
      const data = await res.json();

      loadingState.classList.add('hidden');

      if (!data.success || data.data.length === 0) {
        noResultsState.classList.remove('hidden');
        resultsCountBadge.textContent = '0 نتيجة';
        return;
      }

      currentResults = data.data;
      renderTable(data.data, data.total, data.page, data.totalPages);

    } catch (err) {
      console.error('Search request failed:', err);
      loadingState.classList.add('hidden');
      noResultsState.classList.remove('hidden');
    }
  }

  // Render Table Results
  function renderTable(rows, total, page, totalPages) {
    resultsCountBadge.textContent = `${total.toLocaleString('ar-EG')} نتيجة`;
    resultsTableBody.innerHTML = '';

    rows.forEach((student, idx) => {
      const row = document.createElement('tr');
      const rowNum = (page - 1) * currentLimit + idx + 1;

      // Status Badge class
      let statusClass = 'other';
      if (student.student_case_desc.includes('ناجح')) statusClass = 'pass';
      else if (student.student_case_desc.includes('راسب')) statusClass = 'fail';

      // Percentage calculation out of 410 max degree
      const percent = ((student.total_degree / 410) * 100).toFixed(2);

      row.innerHTML = `
        <td class="code-font">${rowNum}</td>
        <td class="seat-code">${student.seating_no}</td>
        <td class="student-name-cell">${student.arabic_name}</td>
        <td class="degree-val">${student.total_degree}</td>
        <td class="code-font">${percent}%</td>
        <td><span class="badge-status ${statusClass}">${student.student_case_desc}</span></td>
        <td>
          <button class="btn-icon view-student-btn" title="عرض التفاصيل">
            <i class="fa-solid fa-eye"></i>
          </button>
        </td>
      `;

      row.addEventListener('click', () => openModal(student));
      resultsTableBody.appendChild(row);
    });

    tableWrapper.classList.remove('hidden');

    // Pagination Render
    if (totalPages > 1) {
      pagination.classList.remove('hidden');
      pageInfo.textContent = `الصفحة ${page.toLocaleString('ar-EG')} من ${totalPages.toLocaleString('ar-EG')}`;
      prevPageBtn.disabled = (page === 1);
      nextPageBtn.disabled = (page === totalPages);
    } else {
      pagination.classList.add('hidden');
    }
  }

  // Modal Handling
  function openModal(student) {
    modalName.textContent = student.arabic_name;
    modalSeat.textContent = student.seating_no;
    modalDegree.textContent = `${student.total_degree} / 410`;
    modalPercent.textContent = `${((student.total_degree / 410) * 100).toFixed(2)}%`;
    modalStatus.textContent = student.student_case_desc;

    studentModal.classList.remove('hidden');
  }

  function closeModal() {
    studentModal.classList.add('hidden');
  }
});
