// Polyfill jQuery.fn.autocomplete if it is missing, to prevent metadata.js behavior from crashing attachBehaviors
(function () {
  if (typeof jQuery !== 'undefined') {
    if (!jQuery.fn.autocomplete) {
      jQuery.fn.autocomplete = function () { return this; };
    }
  } else {
    var _jquery;
    Object.defineProperty(window, 'jQuery', {
      get: function () { return _jquery; },
      set: function (val) {
        _jquery = val;
        if (_jquery && !_jquery.fn.autocomplete) {
          _jquery.fn.autocomplete = function () { return this; };
        }
      },
      configurable: true
    });
  }
})();

const fG = '#2D6A4F',
  fL = '#40916C',
  gold = '#ffba49',
  red = '#ef5b5b',
  blue = '#2B6CB0',
  purple = '#6e56ab',
  gray = '#718096';

const ache = '#20a39e',
  moy = '#ffba49',
  fai = '#ef5b5b';
Man = '#9e9e9e';

const CHART_ANIM = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ? false
  : {
    duration: 850,
    easing: 'easeOutQuart'
  };

const defO = {
  responsive: true,
  maintainAspectRatio: false,
  animation: CHART_ANIM,
  plugins: {
    legend: {
      display: false
    }
  }
};

const lazyChartQueue = [];

function getChartSection(canvas) {
  return (
    canvas.closest('[data-chart-lazy]') ||
    canvas.closest('.chart-card') ||
    canvas.closest('.chart-card-accordion') ||
    canvas.closest('.one-col') ||
    canvas.parentElement
  );
}

function registerLazyChart(canvasId, initFn) {
  if (!window.Chart) return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const section = getChartSection(canvas);
  if (!section) return;
  section.classList.add('chart-lazy', 'chart-lazy-pending');
  lazyChartQueue.push({
    section,
    init: () => initFn(canvas)
  });
}

function bootLazyCharts() {
  if (!window.Chart || !lazyChartQueue.length) return;

  const activateSection = (section, observer) => {
    const item = lazyChartQueue.find((q) => q.section === section);
    if (!item || section.dataset.chartActivated === 'true') return;
    section.dataset.chartActivated = 'true';
    section.classList.remove('chart-lazy-pending');
    section.classList.add('chart-lazy-visible');
    item.init();
    observer.unobserve(section);
  };

  if (!('IntersectionObserver' in window)) {
    lazyChartQueue.forEach(({ section, init }) => {
      section.dataset.chartActivated = 'true';
      section.classList.remove('chart-lazy-pending');
      section.classList.add('chart-lazy-visible');
      init();
    });
    lazyChartQueue.length = 0;
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) activateSection(entry.target, obs);
      });
    },
    {
      root: null,
      rootMargin: '0px 0px -8% 0px',
      threshold: 0.12
    }
  );

  lazyChartQueue.forEach(({ section }) => observer.observe(section));
}

const parents = document.querySelectorAll(".parent");


// DEFAULT OPEN
document.querySelector(".parent.open")
  ?.querySelector(":scope > .accordion-content")
  ?.classList.add("show");


// PARENT ACCORDION
parents.forEach(parent => {

  const title =
    parent.querySelector(":scope > .accordion-title");

  const content =
    parent.querySelector(":scope > .accordion-content");


  title.addEventListener("click", () => {

    // CLOSE CURRENT
    if (parent.classList.contains("open")) {

      parent.classList.remove("open");

      content.classList.remove("show");


      // CLOSE CHILDREN
      parent.querySelectorAll(".accordion-item").forEach(item => {

        item.classList.remove("open");

        item.querySelector(":scope > .accordion-content")
          ?.classList.remove("show");

      });

    } else {

      // CLOSE OTHERS
      parents.forEach(other => {

        other.classList.remove("open");

        other.querySelector(":scope > .accordion-content")
          ?.classList.remove("show");


        other.querySelectorAll(".accordion-item").forEach(item => {

          item.classList.remove("open");

          item.querySelector(":scope > .accordion-content")
            ?.classList.remove("show");

        });

      });


      // OPEN CURRENT
      parent.classList.add("open");

      content.classList.add("show");

    }

  });

});


// CHILD ACCORDION
const childTitles =
  document.querySelectorAll(".child > .accordion-title");


childTitles.forEach(title => {

  title.addEventListener("click", (e) => {

    e.stopPropagation();

    const item = title.parentElement;

    const content =
      item.querySelector(":scope > .accordion-content");


    item.classList.toggle("open");

    content.classList.toggle("show");

  });

});

if (window.Chart) {

  // STACKED BAR CHART
  registerLazyChart('stackedChart', (canvas) => {
    new Chart(canvas, {
      type: 'bar',

      data: {
        labels: [
          '01 - Objectif Stratégique',
          '02 - Objectif Stratégique',
          '03 - Objectif Stratégique',
          '04 - Objectif Stratégique'
        ],

        datasets: [{
          label: 'Achevé',
          data: [32, 52, 33, 25],
          backgroundColor: ache,
          barPercentage: 0.55,
          borderRadius: 0
        },
        {
          label: 'Moyen',
          data: [28, 22, 35, 28],
          backgroundColor: moy,
          barPercentage: 0.55,
          borderRadius: 0
        },
        {
          label: 'Faible',
          data: [30, 20, 32, 27],
          backgroundColor: fai,
          barPercentage: 0.55,
          borderRadius: 0
        },
        {
          label: 'Manquant',
          data: [10, 6, 0, 20],
          backgroundColor: Man,
          barPercentage: 0.55,
          borderRadius: 0
        }
        ]
      },

      options: {
        ...defO,
        indexAxis: 'y',
        scales: {
          x: {
            stacked: true,
            max: 100,
            ticks: {
              stepSize: 20,
              callback: v => v + '%',
              font: {
                size: 11
              },
              color: gray
            },
            grid: {
              color: 'rgba(0,0,0,0.05)'
            }
          },
          y: {
            stacked: true,
            ticks: {
              font: {
                size: 11
              },
              color: '#4A5568'
            },
            grid: {
              display: false
            }
          }
        },

        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: ctx =>
                ' ' + ctx.dataset.label + ' : ' + ctx.raw + '%'
            }
          }
        }
      }
    });
  });

  // TREND LINE CHART
  registerLazyChart('trendLine', (canvas) => {
    new Chart(canvas, {
      type: 'line',

      data: {
        labels: [
          '2020',
          '2021',
          '2022',
          '2023',
          '2024',
          '2025',
          '2026'
        ],

        datasets: [{
          label: 'Score M&E',
          data: [38, 42, 47, 52, 56, 58, 61],
          borderColor: fG,
          backgroundColor: 'rgba(45,106,79,0.08)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: fG,
          pointRadius: 4,
          borderWidth: 2.5
        },
        {
          label: 'Cible 2030',
          data: [38, 42.9, 47.7, 52.6, 57.4, 62.3, 67.1],
          borderColor: 'rgba(183,121,31,0.5)',
          borderDash: [5, 4],
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 1.5
        }
        ]
      },

      options: {
        ...defO,

        scales: {
          y: {
            min: 30,
            max: 90,

            ticks: {
              callback: v => v + '%',
              font: {
                size: 11
              },
              color: gray
            },

            grid: {
              color: 'rgba(0,0,0,0.05)'
            }
          },

          x: {
            ticks: {
              font: {
                size: 11
              },
              color: gray
            },

            grid: {
              display: false
            }
          }
        }
      }
    });
  });

  // BUDGET CHART
  registerLazyChart('budgetChart', (canvas) => {
    new Chart(canvas, {
      type: 'bar',

      data: {
        labels: [
          'P19001',
          'P19002',
          'P19003',
          'P19004s'
        ],

        datasets: [{
          label: 'Requis',
          data: [520, 180, 680, 310],
          backgroundColor: '#e26d5c',
          barPercentage: 0.7
        },
        {
          label: 'Alloué',
          data: [310, 155, 420, 150],
          backgroundColor: '#723d46',
          barPercentage: 0.7
        }
        ]
      },

      options: {
        ...defO,

        scales: {
          x: {
            ticks: {
              font: {
                size: 10
              },
              color: gray
            },

            grid: {
              display: false
            }
          },

          y: {
            ticks: {
              callback: v => '$' + v + 'M',

              font: {
                size: 11
              },

              color: gray
            },

            grid: {
              color: 'rgba(0,0,0,0.05)'
            }
          }
        }
      }
    });
  });

  // PROJECT DONUT CHART
  registerLazyChart('projDonut', (canvas) => {
    new Chart(canvas, {
      type: 'doughnut',

      data: {
        labels: [
          'Sur cible',
          'En progrès',
          'En retard',
          'Bloqué'
        ],

        datasets: [{
          data: [42, 28, 16, 8],
          backgroundColor: [fG, gold, blue, red],
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 4
        }]
      },

      options: {
        ...defO,

        cutout: '58%',

        plugins: {
          legend: {
            display: false
          },

          tooltip: {
            callbacks: {
              label: ctx =>
                ' ' + ctx.label + ': ' + ctx.raw + ' projets'
            }
          }
        }
      }
    });
  });

  // REGIONAL CHART
  registerLazyChart('regionalChart', (canvas) => {
    new Chart(canvas, {
      type: 'bar',

      data: {
        labels: [
          'Conakry',
          'Kindia',
          'Labé',
          'Kankan',
          'Faranah',
          'Mamou',
          'Boké',
          "N'Zérékoré"
        ],

        datasets: [{
          label: 'Projets',

          data: [22, 14, 12, 11, 10, 9, 8, 8],

          backgroundColor: [
            '#ef476f',
            '#f78c6b',
            '#ffd166',
            '#83d483',
            '#06d6a0',
            '#0cb0a9',
            '#118ab2',
            '#073b4c'
          ],

          borderRadius: 4,
          barPercentage: 0.6
        }]
      },

      options: {
        ...defO,

        scales: {
          x: {
            ticks: {
              font: {
                size: 10
              },
              color: gray
            },

            grid: {
              display: false
            }
          },

          y: {
            ticks: {
              font: {
                size: 11
              },
              color: gray
            },

            grid: {
              color: 'rgba(0,0,0,0.05)'
            }
          }
        }
      }
    });
  });

  // =============
  registerLazyChart('indicatorChart', (canvas) => {
    new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['2023', '2024', '2025', '2026', '2027'],
        datasets: [{
          label: 'Layer 1 (Back)',
          data: [12000, 14000, 20000, 15000, 16000],
          backgroundColor: '#1d2f6f', // Dark Blue
          borderRadius: 4,
          barPercentage: 0.7, // Widest bar
          categoryPercentage: 0.7
        },
        {
          label: 'Layer 2 (Middle)',
          data: [18000, 35000, 32000, null, null],
          backgroundColor: '#8390fa', // Periwinkle Blue
          borderRadius: 4,
          barPercentage: 0.7, // Medium width
          categoryPercentage: 0.7
        },
        {
          label: 'Layer 3 (Front)',
          data: [null, null, 45000, null, null],
          backgroundColor: '#fac748', // Yellow
          borderRadius: 4,
          barPercentage: 0.7, // Narrowest bar to show layers underneath
          categoryPercentage: 0.7
        }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: CHART_ANIM,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            grouped: false, // Prevents side-by-side splitting; forces perfect centering
            grid: {
              display: false
            },
            border: {
              color: '#718096',
              width: 1
            },
            ticks: {
              color: '#718096',
              font: {
                size: 10
              }
            }
          },
          y: {
            min: 0,
            max: 50000,
            grid: {
              display: false
            },
            border: {
              color: '#718096',
              width: 1
            },
            ticks: {
              stepSize: 10000,
              color: '#718096',
              font: {
                size: 10
              },
              callback: function (value) {
                return value.toLocaleString();
              }
            }
          }
        }
      }
    });
  });

  const sdgNames = {
    'SDG 1': 'No Poverty',
    'SDG 2': 'Zero Hunger',
    'SDG 3': 'Good Health and Well-being',
    'SDG 4': 'Quality Education',
    'SDG 5': 'Gender Equality',
    'SDG 6': 'Clean Water and Sanitation',
    'SDG 7': 'Affordable and Clean Energy',
    'SDG 8': 'Decent Work and Economic Growth',
    'SDG 9': 'Industry, Innovation and Infrastructure',
    'SDG 10': 'Reduced Inequalities',
    'SDG 11': 'Sustainable Cities and Communities',
    'SDG 12': 'Responsible Consumption and Production',
    'SDG 13': 'Climate Action',
    'SDG 14': 'Life Below Water',
    'SDG 15': 'Life on Land',
    'SDG 16': 'Peace, Justice and Strong Institutions',
    'SDG 17': 'Partnerships for the Goals'
  };

  const gap = 12;
  const borderRadius = 16;

  // ================= CODE LOGIC FOR CHART 1 =================
  let activeBlocks1 = [];

  function renderChart1() {
    const canvas = document.getElementById('sdgCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    activeBlocks1 = [];

    const row1Items = [{
      name: 'ODD 13',
      color: '#4159c1',
      textColor: '#ffffff',
      weight: Math.random() * 60 + 40
    },
    {
      name: 'ODD 2',
      color: '#1a6865',
      textColor: '#ffffff',
      weight: Math.random() * 40 + 25
    },
    {
      name: 'ODD 15',
      color: '#6fdc9e',
      textColor: '#111111',
      weight: Math.random() * 40 + 25
    },
    {
      name: 'ODD 9',
      color: '#af73c0',
      textColor: '#ffffff',
      weight: Math.random() * 35 + 20
    },
    {
      name: 'ODD 11',
      color: '#f9b664',
      textColor: '#111111',
      weight: Math.random() * 35 + 20
    }
    ];
    const row2Items = [{
      name: 'ODD 17',
      color: '#ca5c30',
      textColor: '#ffffff',
      weight: Math.random() * 25 + 15
    },
    {
      name: 'ODD 7',
      color: '#e5b42d',
      textColor: '#111111',
      weight: Math.random() * 20 + 15
    },
    {
      name: 'ODD 10',
      color: '#5d8aa8',
      textColor: '#ffffff',
      weight: Math.random() * 20 + 12
    },
    {
      name: 'ODD 16',
      color: '#32804c',
      textColor: '#ffffff',
      weight: Math.random() * 20 + 12
    },
    {
      name: 'ODD 8',
      color: '#cc7273',
      textColor: '#ffffff',
      weight: Math.random() * 20 + 12
    },
    {
      name: 'ODD 1',
      color: '#6b1d42',
      textColor: '#ffffff',
      weight: Math.random() * 15 + 10
    },
    {
      name: 'ODD 5',
      color: '#5a7f96',
      textColor: '#ffffff',
      weight: Math.random() * 15 + 10
    },
    {
      name: 'ODD 3',
      color: '#97d762',
      textColor: '#111111',
      weight: Math.random() * 15 + 10
    }
    ];
    const row3Items = [{
      name: 'ODD 4',
      color: '#c06c53',
      textColor: '#ffffff',
      weight: Math.random() * 30 + 20
    },
    {
      name: 'ODD 14',
      color: '#e3a0ac',
      textColor: '#111111',
      weight: Math.random() * 30 + 20
    },
    {
      name: 'ODD 12',
      color: '#5b8ba3',
      textColor: '#ffffff',
      weight: Math.random() * 30 + 20
    },
    {
      name: 'ODD 6',
      color: '#88c458',
      textColor: '#111111',
      weight: Math.random() * 30 + 20
    }
    ];

    const usableHeight = canvas.height - (gap * 4);
    const r1Height = usableHeight * 0.72,
      r2Height = usableHeight * 0.22,
      r3Height = usableHeight * 0.06;
    const r1Y = gap,
      r2Y = r1Y + r1Height + gap,
      r3Y = r2Y + r2Height + gap;

    function draw(items, yStart, rowHeight, fontSize, textOffset = 0) {
      const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
      let currentX = gap;
      const usableWidth = canvas.width - (gap * (items.length + 1));

      items.forEach(item => {
        const itemWidth = (item.weight / totalWeight) * usableWidth;
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.roundRect(currentX, yStart, itemWidth, rowHeight, borderRadius);
        ctx.fill();

        ctx.fillStyle = item.textColor;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.name, currentX + (itemWidth / 2), yStart + (rowHeight / 2) + textOffset);

        activeBlocks1.push({
          name: item.name,
          fullName: sdgNames[item.name],
          value: Math.round(item.weight),
          color: item.color,
          x1: currentX,
          y1: yStart,
          x2: currentX + itemWidth,
          y2: yStart + rowHeight
        });
        currentX += itemWidth + gap;
      });
    }
    draw(row1Items, r1Y, r1Height, 36);
    draw(row2Items, r2Y, r2Height, 26);
    draw(row3Items, r3Y, r3Height, 20, 1);
  }

  // Setup Event Listeners for Chart 1
  const canvas1 = document.getElementById('sdgCanvas');
  const tooltip1 = document.getElementById('tooltip');

  if (canvas1 && tooltip1) {
    canvas1.addEventListener('mousemove', function (e) {
      const rect = canvas1.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) * (canvas1.width / rect.width);
      const mouseY = (e.clientY - rect.top) * (canvas1.height / rect.height);
      let match = activeBlocks1.find(b => mouseX >= b.x1 && mouseX <= b.x2 && mouseY >= b.y1 && mouseY <= b.y2);

      if (match) {
        tooltip1.innerHTML = `<div class="title">${match.name}</div><div>${match.fullName}</div><div class="value">Index: ${match.value}</div>`;
        tooltip1.style.borderLeftColor = match.color;
        tooltip1.style.left = (e.clientX - rect.left + 15) + 'px';
        tooltip1.style.top = (e.clientY - rect.top + 15) + 'px';
        tooltip1.style.display = 'block';
        canvas1.style.cursor = 'pointer';
      } else {
        tooltip1.style.display = 'none';
        canvas1.style.cursor = 'default';
      }
    });
    canvas1.addEventListener('mouseleave', () => tooltip1.style.display = 'none');
  }


  // ================= CODE LOGIC FOR CHART 2 =================
  let activeBlocks2 = [];

  function renderChart2() {
    const canvas = document.getElementById('sdgCanvas2');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    activeBlocks2 = [];

    // Different layout weights assigned for Chart B to look unique
    const row1Items = [{
      name: 'Région 13',
      color: '#4159c1',
      textColor: '#ffffff',
      weight: Math.random() * 30 + 20
    },
    {
      name: 'Région 2',
      color: '#1a6865',
      textColor: '#ffffff',
      weight: Math.random() * 50 + 40
    },
    {
      name: 'Région 9',
      color: '#af73c0',
      textColor: '#ffffff',
      weight: Math.random() * 55 + 40
    },
    {
      name: 'Région 11',
      color: '#f9b664',
      textColor: '#111111',
      weight: Math.random() * 30 + 15
    }
    ];
    const row2Items = [
      {
        name: 'Région 7',
        color: '#e5b42d',
        textColor: '#111111',
        weight: Math.random() * 20 + 10
      },
      {
        name: 'Région 10',
        color: '#5d8aa8',
        textColor: '#ffffff',
        weight: Math.random() * 35 + 25
      },
      {
        name: 'Région 8',
        color: '#cc7273',
        textColor: '#ffffff',
        weight: Math.random() * 20 + 10
      },
      {
        name: 'Région 1',
        color: '#6b1d42',
        textColor: '#ffffff',
        weight: Math.random() * 35 + 20
      },
      {
        name: 'Région 5',
        color: '#5a7f96',
        textColor: '#ffffff',
        weight: Math.random() * 20 + 10
      },
      {
        name: 'Région 3',
        color: '#97d762',
        textColor: '#111111',
        weight: Math.random() * 20 + 10
      }
    ];
    const row3Items = [{
      name: 'Région 4',
      color: '#c06c53',
      textColor: '#ffffff',
      weight: Math.random() * 40 + 10
    },
    {
      name: 'Région 14',
      color: '#e3a0ac',
      textColor: '#111111',
      weight: Math.random() * 40 + 10
    },
    {
      name: 'Région 12',
      color: '#5b8ba3',
      textColor: '#ffffff',
      weight: Math.random() * 40 + 10
    },
    {
      name: 'Région 6',
      color: '#88c458',
      textColor: '#111111',
      weight: Math.random() * 40 + 10
    }
    ];

    const usableHeight = canvas.height - (gap * 4);
    const r1Height = usableHeight * 0.72,
      r2Height = usableHeight * 0.22,
      r3Height = usableHeight * 0.06;
    const r1Y = gap,
      r2Y = r1Y + r1Height + gap,
      r3Y = r2Y + r2Height + gap;

    function draw(items, yStart, rowHeight, fontSize, textOffset = 0) {
      const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
      let currentX = gap;
      const usableWidth = canvas.width - (gap * (items.length + 1));

      items.forEach(item => {
        const itemWidth = (item.weight / totalWeight) * usableWidth;
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.roundRect(currentX, yStart, itemWidth, rowHeight, borderRadius);
        ctx.fill();

        ctx.fillStyle = item.textColor;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.name, currentX + (itemWidth / 2), yStart + (rowHeight / 2) + textOffset);

        activeBlocks2.push({
          name: item.name,
          fullName: sdgNames[item.name],
          value: Math.round(item.weight),
          color: item.color,
          x1: currentX,
          y1: yStart,
          x2: currentX + itemWidth,
          y2: yStart + rowHeight
        });
        currentX += itemWidth + gap;
      });
    }
    draw(row1Items, r1Y, r1Height, 36);
    draw(row2Items, r2Y, r2Height, 26);
    draw(row3Items, r3Y, r3Height, 20, 1);
  }

  // Setup Event Listeners for Chart 2
  const canvas2 = document.getElementById('sdgCanvas2');
  const tooltip2 = document.getElementById('tooltip2');

  if (canvas2 && tooltip2) {
    canvas2.addEventListener('mousemove', function (e) {
      const rect = canvas2.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) * (canvas2.width / rect.width);
      const mouseY = (e.clientY - rect.top) * (canvas2.height / rect.height);
      let match = activeBlocks2.find(b => mouseX >= b.x1 && mouseX <= b.x2 && mouseY >= b.y1 && mouseY <= b.y2);

      if (match) {
        tooltip2.innerHTML = `<div class="title">${match.name}</div><div>${match.fullName}</div><div class="value">Index: ${match.value}</div>`;
        tooltip2.style.borderLeftColor = match.color;
        tooltip2.style.left = (e.clientX - rect.left + 15) + 'px';
        tooltip2.style.top = (e.clientY - rect.top + 15) + 'px';
        tooltip2.style.display = 'block';
        canvas2.style.cursor = 'pointer';
      } else {
        tooltip2.style.display = 'none';
        canvas2.style.cursor = 'default';
      }
    });
    canvas2.addEventListener('mouseleave', () => tooltip2.style.display = 'none');
  }

  registerLazyChart('sdgCanvas', () => renderChart1());
  registerLazyChart('sdgCanvas2', () => renderChart2());

} else {

  document.querySelectorAll('canvas').forEach(canvas => {
    const note = document.createElement('div');

    note.className = 'narr';

    note.innerHTML =
      '<p>Les graphiques nécessitent le chargement de Chart.js pour s’afficher.</p>';

    canvas.replaceWith(note);
  });
}

// MAP
const PC = {
  p1: '#ef5b5b',
  p2: '#2B6CB0',
  p3: '#ffba49',
  p4: '#6e56ab'
};

const PL = {
  p1: 'P19001 - Pilotage et soutien',
  p2: 'P19002 - Inclusion Sociale, Solidarité & indigence',
  p3: "P19003 - Protection et bien-être de l'enfant",
  p4: 'P19004 - Promotion des Droits et l’autonomisation des femmes et filles',
  mainTitle: "Réforme des systèmes d'état civil",
};

const PROJECTS = [
  {
    id: 1,
    cx: 157,
    cy: 287,
    prog: 'p2',
    status: 'ontarget',
    pct: 72,
    titleHead: 'mainTitle',
    title: "Réforme des systèmes d'état civil",
    org: "Ministère Intérieur",
    region: "Conakry",
    budget: "$18M",
    disbursed: "$12.4M",
    ben: "ODD 1",
    start: "Jan 2023",
    end: "Déc 2026",
    partners: ["PNUD", "UE", "INS"],
    narr: "Numérisation des registres d'état civil et formation de 400 agents dans 5 préfectures."
  },

  {
    id: 2,
    cx: 210,
    cy: 240,
    prog: 'p3',
    status: 'ontarget',
    pct: 65,
    titleHead: 'mainTitle',
    title: "Développement des infrastructures rurales",
    org: "Ministère Agriculture",
    region: "Kindia",
    budget: "$10M",
    disbursed: "$6.8M",
    ben: "ODD 2",
    start: "Mar 2023",
    end: "Déc 2025",
    partners: ["PNUD", "BAD", "FAO"],
    narr: "Construction de routes rurales et amélioration des systèmes d’irrigation pour les communautés agricoles."
  },

  {
    id: 3,
    cx: 260,
    cy: 180,
    prog: 'p1',
    status: 'delayed',
    pct: 48,
    titleHead: 'mainTitle',
    title: "Programme d'accès à l'éducation",
    org: "Ministère Éducation",
    region: "Labé",
    budget: "$14M",
    disbursed: "$5.9M",
    ben: "ODD 4",
    start: "Sep 2022",
    end: "Juin 2026",
    partners: ["UNICEF", "UE", "AFD"],
    narr: "Construction de salles de classe et distribution de kits scolaires dans les zones rurales."
  },

  {
    id: 4,
    cx: 340,
    cy: 260,
    prog: 'p4',
    status: 'ontarget',
    pct: 81,
    titleHead: 'mainTitle',
    title: "Renforcement du système de santé",
    org: "Ministère Santé",
    region: "Kankan",
    budget: "$20M",
    disbursed: "$16.2M",
    ben: "ODD 3",
    start: "Jan 2022",
    end: "Déc 2025",
    partners: ["OMS", "UNICEF", "USAID"],
    narr: "Réhabilitation de centres de santé et formation du personnel médical régional."
  },

  {
    id: 5,
    cx: 295,
    cy: 320,
    prog: 'p2',
    status: 'risk',
    pct: 54,
    titleHead: 'mainTitle',
    title: "Projet de sécurité alimentaire",
    org: "Ministère Agriculture",
    region: "Faranah",
    budget: "$9M",
    disbursed: "$4.1M",
    ben: "ODD 2",
    start: "Mai 2023",
    end: "Nov 2025",
    partners: ["FAO", "PAM", "UE"],
    narr: "Soutien aux coopératives agricoles et distribution de semences améliorées."
  },

  {
    id: 6,
    cx: 185,
    cy: 190,
    prog: 'p5',
    status: 'ontarget',
    pct: 76,
    titleHead: 'mainTitle',
    title: "Accès à l'eau potable",
    org: "Ministère Hydraulique",
    region: "Mamou",
    budget: "$11M",
    disbursed: "$8.3M",
    ben: "ODD 6",
    start: "Fév 2023",
    end: "Août 2026",
    partners: ["UNICEF", "BAD", "UE"],
    narr: "Installation de forages modernes et sensibilisation à l’hygiène communautaire."
  },

  {
    id: 7,
    cx: 120,
    cy: 160,
    prog: 'p3',
    status: 'ontarget',
    pct: 69,
    titleHead: 'mainTitle',
    title: "Développement minier durable",
    org: "ndiale / Ministère Mines",
    region: "Boké",
    budget: "$25M",
    disbursed: "$17.5M",
    ben: "ODD 8",
    start: "Avr 2022",
    end: "Déc 2027",
    partners: ["BM", "PNUD", "UE"],
    narr: "Renforcement des capacités locales et amélioration des infrastructures minières."
  },

  {
    id: 8,
    cx: 390,
    cy: 390,
    prog: 'p1',
    status: 'delayed',
    pct: 43,
    titleHead: 'mainTitle',
    title: "Protection des forêts tropicales",
    org: "Ministère Environnement",
    region: "N'Zérékoré",
    budget: "$13M",
    disbursed: "$5.4M",
    ben: "ODD 15",
    start: "Juil 2023",
    end: "Déc 2026",
    partners: ["PNUE", "WWF", "UE"],
    narr: "Programme de reboisement et protection des écosystèmes forestiers du sud-est."
  }
];

// HALF DONUT CHART
const halfDonutLabelPlugin = {
  id: 'halfDonutLabelPlugin',

  afterDatasetsDraw(chart) {
    const {
      ctx
    } = chart;
    const meta = chart.getDatasetMeta(0);

    ctx.save();

    meta.data.forEach((element, index) => {
      const value = chart.data.datasets[0].data[index];

      const angle = (element.startAngle + element.endAngle) / 2;

      const x = element.x + Math.cos(angle) * (element.outerRadius + 16);
      const y = element.y + Math.sin(angle) * (element.outerRadius + 16);

      // connector line
      const lineX = element.x + Math.cos(angle) * (element.outerRadius + 8);
      const lineY = element.y + Math.sin(angle) * (element.outerRadius + 8);

      ctx.beginPath();
      ctx.moveTo(lineX, lineY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = chart.data.datasets[0].backgroundColor[index];
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = '11px';
      ctx.fillStyle = '#111';
      ctx.textAlign = x >= element.x ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(value + '%', x + (x >= element.x ? 4 : -4), y);
    });
    ctx.restore();
  }
};

registerLazyChart('sdgHalfDonut', (canvas) => {
  new Chart(canvas, {
    type: 'doughnut',

    data: {
      // labels: [
      //     'Achevé',
      //     'Moyen',
      //     'Faible',
      //     'Missing'
      // ],

      datasets: [{
        data: [30, 20, 30, 20],
        backgroundColor: [
          '#20a39e', // green
          '#ffba49', // yellow
          '#ef5b5b', // red
          '#9e9e9e' // gray
        ],
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 4
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: CHART_ANIM,
      rotation: -90,
      circumference: 180,
      cutout: '68%',
      layout: {
        padding: {
          top: 30,
          left: 10,
          right: 10,
          bottom: 0
        }
      },

      plugins: {
        legend: {
          position: 'bottom',

          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 10,
            font: {
              size: 10
            }
          }
        },

        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.label}: ${ctx.raw}%`
          }
        }
      }
    },

    plugins: [halfDonutLabelPlugin]
  });
});

registerLazyChart('sdgHalfDonutSimandou', (canvas) => {
  new Chart(canvas, {
    type: 'doughnut',

    data: {
      // labels: [
      //     'Achevé',
      //     'Moyen',
      //     'Faible',
      //     'Missing'
      // ],

      datasets: [{
        data: [10, 30, 30, 30],
        backgroundColor: [
          '#20a39e', // green
          '#ffba49', // yellow
          '#ef5b5b', // red
          '#9e9e9e' // gray
        ],
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 4
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: CHART_ANIM,
      rotation: -90,
      circumference: 180,
      cutout: '68%',
      layout: {
        padding: {
          top: 30,
          left: 10,
          right: 10,
          bottom: 0
        }
      },

      plugins: {
        legend: {
          position: 'bottom',

          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 10,
            font: {
              size: 10
            }
          }
        },

        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.label}: ${ctx.raw}%`
          }
        }
      }
    },

    plugins: [halfDonutLabelPlugin]
  });
});

registerLazyChart('sdgHalfDonutSectors', (canvas) => {
  new Chart(canvas, {
    type: 'doughnut',

    data: {
      // labels: [
      //     'Achevé',
      //     'Moyen',
      //     'Faible',
      //     'Missing'
      // ],

      datasets: [{
        data: [25, 25, 35, 15],
        backgroundColor: [
          '#20a39e', // green
          '#ffba49', // yellow
          '#ef5b5b', // red
          '#9e9e9e' // gray
        ],
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 4
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: CHART_ANIM,
      rotation: -90,
      circumference: 180,
      cutout: '68%',
      layout: {
        padding: {
          top: 30,
          left: 10,
          right: 10,
          bottom: 0
        }
      },

      plugins: {
        legend: {
          position: 'bottom',

          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 10,
            font: {
              size: 10
            }
          }
        },

        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.label}: ${ctx.raw}%`
          }
        }
      }
    },

    plugins: [halfDonutLabelPlugin]
  });
});

// HALF DONUT CHART
const halfDonutVisionPlugin = {
  id: 'halfDonutVisionPlugin',

  afterDatasetsDraw(chart) {
    const {
      ctx
    } = chart;
    const meta = chart.getDatasetMeta(0);

    ctx.save();

    meta.data.forEach((element, index) => {
      const value = chart.data.datasets[0].data[index];

      const angle = (element.startAngle + element.endAngle) / 2;

      const x = element.x + Math.cos(angle) * (element.outerRadius + 16);
      const y = element.y + Math.sin(angle) * (element.outerRadius + 16);

      // connector line
      const lineX = element.x + Math.cos(angle) * (element.outerRadius + 8);
      const lineY = element.y + Math.sin(angle) * (element.outerRadius + 8);

      ctx.beginPath();
      ctx.moveTo(lineX, lineY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = chart.data.datasets[0].backgroundColor[index];
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = '11px';
      ctx.fillStyle = '#111';
      ctx.textAlign = x >= element.x ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(value + '%', x + (x >= element.x ? 4 : -4), y);
    });
    ctx.restore();
  }
};

registerLazyChart('visionChart', (canvas) => {
  new Chart(canvas, {
    type: 'doughnut',

    data: {
      // labels: [
      //     'Achevé',
      //     'Moyen',
      //     'Faible',
      //     'Missing'
      // ],

      datasets: [{
        data: [30, 10, 30, 30],
        backgroundColor: [
          '#20a39e', // green
          '#ffba49', // yellow
          '#ef5b5b', // red
          '#9e9e9e' // gray
        ],
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 4
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: CHART_ANIM,
      rotation: -90,
      circumference: 180,
      cutout: '68%',
      layout: {
        padding: {
          top: 30,
          left: 10,
          right: 10,
          bottom: 0
        }
      },

      plugins: {
        legend: {
          position: 'bottom',

          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 10,
            font: {
              size: 10
            }
          }
        },

        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.label}: ${ctx.raw}%`
          }
        }
      }
    },

    plugins: [halfDonutVisionPlugin]
  });
});

let mapActiveFilt = 'all';

function makePin(p) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('data-prog', p.prog);
  g.setAttribute('transform', `translate(${p.cx},${p.cy})`);
  g.setAttribute('tabindex', '0');
  g.setAttribute('role', 'button');
  g.setAttribute('aria-label', `${p.title}, ${p.region}, ${PL[p.prog]}`);
  g.style.cursor = 'pointer';
  const color = PC[p.prog];
  const ring = p.status === 'ontarget' ? '#20a39e' : p.status === 'delayed' ? '#9B2C2C' : '#744210';
  const sw = p.status === 'delayed' ? '2' : '1.5';
  const da = p.status === 'progress' ? '3,2' : null;
  const drop = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  drop.setAttribute('cx', '0');
  drop.setAttribute('cy', '2');
  drop.setAttribute('rx', '5');
  drop.setAttribute('ry', '2.5');
  drop.setAttribute('fill', 'rgba(0,0,0,0.18)');
  g.appendChild(drop);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M0 -18 C-7,-18 -11,-13 -11,-8 C-11,0 0,14 0,14 C0,14 11,0 11,-8 C11,-13 7,-18 0,-18 Z');
  path.setAttribute('fill', color);
  g.appendChild(path);
  const ci = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ci.setAttribute('cx', '0');
  ci.setAttribute('cy', '-8');
  ci.setAttribute('r', '5.5');
  ci.setAttribute('fill', 'rgba(255,255,255,0.9)');
  g.appendChild(ci);
  const cr = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  cr.setAttribute('cx', '0');
  cr.setAttribute('cy', '-8');
  cr.setAttribute('r', '5.5');
  cr.setAttribute('fill', 'none');
  cr.setAttribute('stroke', ring);
  cr.setAttribute('stroke-width', sw);
  if (da) cr.setAttribute('stroke-dasharray', da);
  g.appendChild(cr);
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', '0');
  dot.setAttribute('cy', '-8');
  dot.setAttribute('r', '2.5');
  dot.setAttribute('fill', color);
  g.appendChild(dot);
  const tip = document.getElementById('mapTip');
  g.addEventListener('mouseenter', e => {
    const r = document.getElementById('mapArea').getBoundingClientRect();
    tip.style.display = 'block';
    tip.style.left = (e.clientX - r.left + 14) + 'px';
    tip.style.top = (e.clientY - r.top - 52) + 'px';
    tip.innerHTML = `<strong>${p.title}</strong><br>${p.org}<br><span style="color:#9CA3AF;font-size:10px">${p.region} · ${p.budget}</span>`;
    g.setAttribute('transform', `translate(${p.cx},${p.cy}) scale(1.2)`);
  });
  g.addEventListener('mousemove', e => {
    const r = document.getElementById('mapArea').getBoundingClientRect();
    tip.style.left = (e.clientX - r.left + 14) + 'px';
    tip.style.top = (e.clientY - r.top - 52) + 'px';
  });
  g.addEventListener('mouseleave', () => {
    tip.style.display = 'none';
    g.setAttribute('transform', `translate(${p.cx},${p.cy})`);
  });
  g.addEventListener('click', () => openSb(p));
  g.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openSb(p);
    }
  });
  return g;
}

function renderPins() {
  const grp = document.getElementById('mapPins');
  if (!grp) return;
  grp.innerHTML = '';
  let vis = 0;
  PROJECTS.forEach(p => {
    if (mapActiveFilt === 'all' || p.prog === mapActiveFilt) {
      grp.appendChild(makePin(p));
      vis++;
    }
  });
  const mapVisCt = document.getElementById('map-vis-ct');
  if (mapVisCt) {
    mapVisCt.textContent = vis;
  }
}

function mapFilt(f, btn) {
  mapActiveFilt = f;
  document.querySelectorAll('.fb').forEach(b => {
    b.classList.remove('on');
    b.setAttribute('aria-pressed', 'false')
  });
  btn.classList.add('on');
  btn.setAttribute('aria-pressed', 'true');
  renderPins();
}

function openSb(p) {
  const drawer = document.getElementById('mapSb');
  drawer.classList.remove('closed');
  drawer.setAttribute('aria-hidden', 'false');
  drawer.closest('.map-body').classList.add('map-open');
  document.getElementById('sb-title').textContent = PL[p.titleHead];
  const color = PC[p.prog];
  const sMap = {
    ontarget: ['s-on', 'Sur cible'],
    progress: ['s-pr', 'En progrès'],
    delayed: ['s-dl', 'En retard']
  };
  // color:${color};
  const [sCls, sLbl] = sMap[p.status] || ['s-pr', 'En cours'];
  document.getElementById('sb-body').innerHTML = `<div><span class="dc-badge" style="padding: 0;">${PL[p.prog]}</span><div class="dc-org">${p.org}</div><span class="dc-status ${sCls}">${sLbl}</span><div class="dc-div"></div><div class="dc-row"><span class="dc-rl">Région</span><span class="dc-rv">${p.region}</span></div><div class="dc-row"><span class="dc-rl">Budget</span><span class="dc-rv">${p.budget}</span></div><div class="dc-row"><span class="dc-rl">Décaissé</span><span class="dc-rv">${p.disbursed}</span></div><div class="dc-row"><span class="dc-rl">ODD</span><span class="dc-rv">${p.ben}</span></div><div class="dc-row"><span class="dc-rl">Période</span><span class="dc-rv">${p.start} — ${p.end}</span></div><div class="dc-div"></div><div class="dc-narr">${p.narr}</div><div class="dc-ptags" style="margin-top:10px"><div style="font-size:9px;color:var(--lgt);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Partenaires</div>${p.partners.map(pt => `<span class="dc-ptag">${pt}</span>`).join('')}</div></div>`;
}

function closeSb() {
  const drawer = document.getElementById('mapSb');
  drawer.classList.add('closed');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.closest('.map-body').classList.remove('map-open');
}
if (document.getElementById('mapPins')) {
  renderPins();
}


document.querySelectorAll('.acc-head').forEach(head => {
  head.addEventListener('click', () => {
    const item = head.parentElement;
    const body = item.querySelector(':scope > .acc-body');
    const isOpen = item.classList.contains('active');
    if (isOpen) {
      body.style.height = body.scrollHeight + 'px';
      requestAnimationFrame(() => {
        body.style.height = '0px';
      });
      item.classList.remove('active');
    } else {
      item.classList.add('active');
      body.style.height = body.scrollHeight + 'px';
      body.addEventListener('transitionend', function handler() {
        if (item.classList.contains('active')) {
          body.style.height = 'auto';
        }
        body.removeEventListener('transitionend', handler);
      });
    }
  });
});

registerLazyChart('objectiveChart1', (canvas) => {
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: [
        'Cadre juridique',
        'Inclusion',
        'Résilience'
      ],
      datasets: [{
        label: 'Performance',
        data: [74, 61, 49],
        backgroundColor: [
          '#2D6A4F',
          '#ffba49',
          '#ef5b5b'
        ],
        borderRadius: 6
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: CHART_ANIM,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }

  });
});

bootLazyCharts();