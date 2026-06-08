window.HELP_IMPROVE_VIDEOJS = false;

var INTERP_BASE = "./static/interpolation/stacked";
var NUM_INTERP_FRAMES = 240;

var interp_images = [];
function preloadInterpolationImages() {
  for (var i = 0; i < NUM_INTERP_FRAMES; i++) {
    var path = INTERP_BASE + '/' + String(i).padStart(6, '0') + '.jpg';
    interp_images[i] = new Image();
    interp_images[i].src = path;
  }
}

function setInterpolationImage(i) {
  var image = interp_images[i];
  image.ondragstart = function() { return false; };
  image.oncontextmenu = function() { return false; };
  $('#interpolation-image-wrapper').empty().append(image);
}


$(document).ready(function() {
    document.querySelectorAll('.coming-soon-link').forEach(function(link) {
      link.addEventListener('click', function(event) {
        event.preventDefault();
      });
    });

    // Check for click events on the navbar burger icon
    $(".navbar-burger").click(function() {
      // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
      $(".navbar-burger").toggleClass("is-active");
      $(".navbar-menu").toggleClass("is-active");

    });

    var options = {
			slidesToScroll: 1,
			slidesToShow: 3,
			loop: true,
			infinite: true,
			autoplay: false,
			autoplaySpeed: 3000,
    }

		// Initialize all div with carousel class
    var carousels = bulmaCarousel.attach('.carousel', options);

    // Loop on each carousel initialized
    for(var i = 0; i < carousels.length; i++) {
    	// Add listener to  event
    	carousels[i].on('before:show', state => {
    		console.log(state);
    	});
    }

    // Access to bulmaCarousel instance of an element
    var element = document.querySelector('#my-element');
    if (element && element.bulmaCarousel) {
    	// bulmaCarousel instance is available as element.bulmaCarousel
    	element.bulmaCarousel.on('before-show', function(state) {
    		console.log(state);
    	});
    }

    /*var player = document.getElementById('interpolation-video');
    player.addEventListener('loadedmetadata', function() {
      $('#interpolation-slider').on('input', function(event) {
        console.log(this.value, player.duration);
        player.currentTime = player.duration / 100 * this.value;
      })
    }, false);*/
    preloadInterpolationImages();

    $('#interpolation-slider').on('input', function(event) {
      setInterpolationImage(this.value);
    });
    setInterpolationImage(0);
    $('#interpolation-slider').prop('max', NUM_INTERP_FRAMES - 1);

    bulmaSlider.attach();

    // Trace prediction baseline comparison
    var TRACE_TASKS = [
      {
        id: 1,
        sampleId: 95,
        stem: 'sample_000095_robot_episode_002.mp4_f000012',
        description: 'Pick up the purple block and place it on top of the blue block.'
      },
      {
        id: 2,
        sampleId: 128,
        stem: 'sample_000128_human_episode_006.mp4_f000012',
        description: 'Take the milk out of the refrigerator.'
      },
      {
        id: 3,
        sampleId: 109,
        stem: "sample_000109_pick up the rubik's cube..mov_f000012",
        description: "Pick up the rubik's cube."
      },
      {
        id: 4,
        sampleId: 48,
        stem: 'sample_000048_human_episode_002.mp4_f000004',
        description: 'Open the drawer.'
      },
      {
        id: 5,
        sampleId: 23,
        stem: 'sample_000023_robot_episode_006.mp4_f000012',
        description: 'Pick up the kettle.'
      },
      {
        id: 6,
        sampleId: 90,
        stem: 'sample_000090_human_episode_005.mp4_f000012',
        description: 'Pour water from the kettle into the cup.'
      },
      {
        id: 7,
        sampleId: 87,
        stem: 'sample_000087_robot_episode_010.mp4_f000008',
        description: 'Pick up the purple block and place it inside the box.'
      },
      {
        id: 8,
        sampleId: 113,
        stem: 'sample_000113_human_episode_004.mp4_f000004',
        description: 'Turn on the toaster.'
      },
      {
        id: 9,
        sampleId: 40,
        stem: 'sample_000040_pick up the green star shaped block and put it to the right of the white heart shaped block..mov_f000012',
        description: 'Pick up the green star shaped block and put it to the right of the white heart shaped block.'
      }
    ];

    var TRACE_BASELINES = [
      { id: 'ours', label: 'Ours (\u03bc\u2080)' },
      { id: 'tracegen', label: 'TraceGen' },
      { id: 'track2act', label: 'Track2Act' },
      { id: '3dflowaction', label: '3DFlowAction' },
      { id: 'dream2flow', label: 'Dream2Flow' },
      { id: 'gemini31pro', label: 'Gemini 3.1 Pro' },
      { id: 'gemini3flash', label: 'Gemini 3 Flash' },
      { id: 'gpt55', label: 'GPT-5.5' },
      { id: 'hamster', label: 'Hamster' }
    ];

    var TRACE_3D_GROUPS = {
      robot: [
        {
          id: 'sample_000007_pick up the orange..mov_f000000',
          label: 'Pick up the orange'
        },
        {
          id: 'sample_000023_robot_episode_010.mp4_f000000',
          label: 'Robot episode 010'
        },
        {
          id: 'sample_000011_robot_episode_005.mp4_f000000',
          label: 'Robot episode 005'
        },
        {
          id: 'sample_000004_put the blue block in the pink area._f000000',
          label: 'Put the blue block in the pink area'
        }
      ],
      human: [
        {
          id: 'sample_000008_human_episode_008.mp4_f000000',
          label: 'Human episode 008'
        },
        {
          id: 'sample_000022_human_episode_007.mp4_f000000',
          label: 'Human episode 007'
        },
        {
          id: 'sample_000034_human_episode_003.mp4_f000000',
          label: 'Human episode 003'
        },
        {
          id: 'sample_000009_human_episode_006.mp4_f000000',
          label: 'Human episode 006'
        }
      ]
    };

    function updateTraceComparison() {
      var taskIndex = $('#trace-task-selector').val();
      var baselineId = $('#trace-baseline-selector').val();
      var task = TRACE_TASKS[taskIndex];
      var baseline = TRACE_BASELINES.filter(function (item) {
        return item.id === baselineId;
      })[0];

      if (!task || !baseline) {
        return;
      }

      $('#trace-original-image').attr(
        'src',
        './static/images/original/' + task.stem + '_rgb.png'
      );
      $('#trace-gt-image').attr('src', './static/images/gt/' + task.stem + '.png');
      $('#trace-baseline-image').attr(
        'src',
        './static/images/' + baseline.id + '/' + task.stem + '.png'
      );
      $('#trace-task-description').text('Task ' + task.id + ': ' + task.description);
      $('#trace-baseline-label').html('<strong>' + baseline.label + '</strong>');
    }

    function updateTrace3DVideos(group) {
      var samples = TRACE_3D_GROUPS[group];
      var grid = document.getElementById('trace-3d-grid');

      if (!samples || !samples.length || !grid) {
        return;
      }

      grid.innerHTML = '';

      samples.forEach(function (sample) {
        var column = document.createElement('div');
        column.className = 'column is-6';

        var viewer = document.createElement('div');
        viewer.className = 'trace-3d-viewer';

        var video = document.createElement('video');
        video.setAttribute('poster', '');
        video.autoplay = true;
        video.controls = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;

        var source = document.createElement('source');
        source.src = './static/videos/3d_vis/' + sample.id + '.mp4';
        source.type = 'video/mp4';

        video.appendChild(source);
        viewer.appendChild(video);
        column.appendChild(viewer);
        grid.appendChild(column);

        video.load();
        video.play().catch(function () { });
      });
    }

    if ($('#trace-task-selector').length) {
      TRACE_TASKS.forEach(function (task, index) {
        $('#trace-task-selector').append(
          $('<option></option>')
            .val(index)
            .text('Task ' + task.id)
        );
      });

      TRACE_BASELINES.forEach(function (baseline) {
        $('#trace-baseline-selector').append(
          $('<option></option>').val(baseline.id).text(baseline.label)
        );
      });

      $('#trace-task-selector, #trace-baseline-selector').on('change', updateTraceComparison);

      var groupButtons = document.querySelectorAll('.trace-3d-group-buttons button[data-3d-group]');
      groupButtons.forEach(function (button) {
        button.addEventListener('click', function () {
          var group = button.getAttribute('data-3d-group');

          groupButtons.forEach(function (groupButton) {
            groupButton.classList.remove('is-primary');
          });
          button.classList.add('is-primary');
          updateTrace3DVideos(group);
        });
      });

      updateTraceComparison();
      updateTrace3DVideos('robot');
    }

})
