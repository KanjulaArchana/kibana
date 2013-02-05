labjs = labjs.script("common/lib/panels/jquery.flot.js")
  .script("common/lib/panels/jquery.flot.pie.js")

angular.module('kibana.pie', [])
.controller('pie', function($scope, $rootScope) {

  var _id = _.uniqueId();

  // Set and populate defaults
  var _d = {
    query   : "*",
    size    : 100,
    exclude : [],
    donut   : false,
    tilt    : false,
    legend  : true,
    labels  : true,
    group   : "default"
  }
  _.defaults($scope.panel,_d)

  $scope.init = function() {
    $scope.$on(_id+"-time", function(event,time){set_time(time)});
    $scope.$on($scope.panel.group+"-time", function(event,time){set_time(time)});
    if(!(_.isArray($scope.panel.query))) {
      $scope.$on($scope.panel.group+"-query", function(event, query) {
        $scope.panel.query.query = query;
        $scope.get_data();
      });
    }
    // Now that we're all setup, request the time from our group
    $rootScope.$broadcast($scope.panel.group+"-get_time",_id)
  }

  $scope.get_data = function() {
    // Make sure we have everything for the request to complete
    if(_.isUndefined($scope.panel.index) || _.isUndefined($scope.panel.time))
      return

    var request = $scope.ejs.Request().indices($scope.panel.index);

    // If we have an array, use query facet
    if(_.isArray($scope.panel.query)) {
      var queries = [];
      // Build the question part of the query
      _.each($scope.panel.query, function(v) {
        queries.push(ejs.FilteredQuery(
          ejs.QueryStringQuery(v.query || '*'),
          ejs.RangeFilter(config.timefield)
            .from($scope.panel.time.from)
            .to($scope.panel.time.to)
            .cache(false))
        )
      });

      // Then the insert into facet and make the request
      _.each(queries, function(v) {
        request = request.facet(ejs.QueryFacet(_.indexOf(queries,v))
          .query(v)
          .facetFilter(ejs.QueryFilter(v))
        )
      })
      var results = request.doSearch();

      // Populate scope when we have results
      results.then(function(results) {
        $scope.hits = results.hits.total;
        $scope.data = [];
        _.each(results.facets, function(v, k) {
          var series = {};
          var slice = { label : $scope.panel.query[k].label, data : v.count }; 
          if (!(_.isUndefined($scope.panel.query[k].color)))
            slice.color = $scope.panel.query[k].color;
          $scope.data.push(slice)
        });
      });
    // If we don't have an array, assume its a term facet.
    } else {
      var results = request
        .facet(ejs.TermsFacet('pie')
          .field($scope.panel.query.field)
          .size($scope.panel['size'])
          .exclude($scope.panel.exclude)
          .facetFilter(ejs.QueryFilter(
            ejs.FilteredQuery(
              ejs.QueryStringQuery($scope.panel.query.query || '*'),
              ejs.RangeFilter(config.timefield)
                .from($scope.panel.time.from)
                .to($scope.panel.time.to)
                .cache(false)
              )))).size(0)
        .doSearch();

      // Populate scope when we have results
      results.then(function(results) {
        $scope.hits = results.hits.total;
        $scope.data = [];
        var k = 0;
        _.each(results.facets.pie.terms, function(v) {
          var slice = { label : v.term, data : v.count }; 
          $scope.data.push();
          if(!(_.isUndefined($scope.panel.colors)) 
            && _.isArray($scope.panel.colors)
            && $scope.panel.colors.length > 0) {
            slice.color = $scope.panel.colors[k%$scope.panel.colors.length];
          } 
          $scope.data.push(slice)
          k = k + 1;
        });
      });
    }
  }

  function set_time(time) {
    $scope.panel.time = time;
    $scope.panel.index = _.isUndefined(time.index) ? $scope.panel.index : time.index
    $scope.get_data();
  }

  // Ready, init
  $scope.init()

})
.directive('pie', function() {
  return {
    restrict: 'A',
    link: function(scope, elem, attrs) {

      // Watch if data or row state changes
      scope.$watch(function () {
        return angular.toJson([scope.data, scope.row]) 
      }, function() {
        if(!(_.isUndefined(scope.data)))
          render_panel(scope,elem,attrs);
      });

      // Or if the window is resized
      angular.element(window).bind('resize', function(){
          render_panel(scope,elem,attrs);
      });

      // Function for rendering panel
      function render_panel(scope,elem,attrs) {
        var pie = {
          series: {
            pie: {
              innerRadius: scope.panel.donut ? 0.4 : 0,
              tilt: scope.panel.tilt ? 0.45 : 1,
              radius: 1,
              show: true,
              combine: {
                color: '#999',
                label: 'The Rest'
              },
              label: { 
                show: scope.panel.labels,
                radius: 2/3,
                formatter: function(label, series){
                  return '<div style="font-size:8pt;text-align:center;padding:2px;color:white;">'+
                    label+'<br/>'+Math.round(series.percent)+'%</div>';
                },
                threshold: 0.1 
              }
            }
          },
          //grid: { hoverable: true, clickable: true },
          grid:   { hoverable: true, clickable: true },
          legend: { show: scope.panel.legend }
        };

        // Populate element
        if(elem.is(":visible")){
          $.plot(elem, scope.data, pie);
        }
        
        function piett(x, y, contents) {
          var tooltip = $('#pie-tooltip').length ? 
            $('#pie-tooltip') : $('<div id="pie-tooltip"></div>');
          //var tooltip = $('#pie-tooltip')
          tooltip.text(contents).css({
            position: 'absolute',
            top     : y + 5,
            left    : x + 5,
            color   : "#FFF",
            border  : '1px solid #FFF',
            padding : '2px',
            'font-size': '8pt',
            'background-color': '#000',
          }).appendTo("body");
        }

        elem.bind("plothover", function (event, pos, item) {
          if (item) {
            var percent = parseFloat(item.series.percent).toFixed(2) + "%";
            piett(pos.pageX, pos.pageY, percent + " " + item.series.label);
          } else {
            $("#pie-tooltip").remove();
          }
        });
      }
    }
  };
})