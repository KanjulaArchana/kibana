/** @scratch /panels/5
 * include::panels/force.asciidoc[]
 */

/** @scratch /panels/force/0
 * == Force diagram
 * Status: *Experimental*
 *
 * This panel creates a force chart between the src_ip and dst_ip fields.
 */

define([
  'angular',
  'app',
  'lodash',
  'jquery',
  'http://d3js.org/d3.v3.js'
],
 function (angular, app, _, $, d3) {
  'use strict';
  var module = angular.module('kibana.panels.force', []);
  app.useModule(module);

  console.log('force module loaded');

  module.controller('force', function($scope, $rootScope, querySrv, dashboard, filterSrv) {

    console.log('force controller loaded');

    $scope.panelMeta = {
      editorTabs : [
        {title:'Queries', src:'app/partials/querySelect.html'},
        {title:'Style', src:'app/panels/force/styleEditor.html'}
      ],
      modals : [
        {
          description: "Inspect",
          icon: "icon-info-sign",
          partial: "app/partials/inspector.html",
          show: $scope.panel.spyable
        }
      ],
      status  : "Experimental",
      description : "Displays a force plot based on a source and a destination field."
    };

    $scope.dashboard = dashboard;

    // Set and populate defaults
    var _d = {
      /** @scratch /panels/force/3
       * spyable:: Setting spyable to false disables the inspect icon.
       */
      spyable : true,
      /** @scratch /panels/map/3
       * size:: Max number of nodes to draw
       */
      size    : 50,
      /** @scratch /panels/force/5
       * ==== Queries
       * queries object:: This object describes the queries to use on this panel.
       * queries.mode::: Of the queries available, which to use. Options: +all, pinned, unpinned, selected+
       * queries.ids::: In +selected+ mode, which query ids are selected.
       */
      queries     : {
        mode        : 'all',
        ids         : []
      },
      color    : null,
      node_size: 15
    };
    _.defaults($scope.panel,_d);

    $scope.init = function() {
      console.log('force scope init');
      $scope.$on('refresh',function(){
        $scope.get_data();
      });
      $scope.get_data();
    };

    $scope.get_data = function() {
      console.log('force scope get_data');

      $scope.panelMeta.loading = true;

      var request,
        boolQuery,
        queries;
      var ejs = $scope.ejs;

      $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);

      queries = querySrv.getQueryObjs($scope.panel.queries.ids);
      boolQuery = $scope.ejs.BoolQuery();
      _.each(queries,function(q) {
        boolQuery = boolQuery.should(querySrv.toEjsObj(q));
      });


      request = $scope.ejs.Request().indices(dashboard.indices);
      request = request
        .facet($scope.ejs.TermsFacet('src_terms')
          .field($scope.panel.src_field)
          .size($scope.panel.size)
          .facetFilter($scope.ejs.QueryFilter(
            $scope.ejs.FilteredQuery(
              boolQuery,
              filterSrv.getBoolFilter(filterSrv.ids())
            )
          ))
        )
        .facet($scope.ejs.TermsFacet('dst_terms')
          .field($scope.panel.dst_field)
          .size($scope.panel.size)
          .facetFilter($scope.ejs.QueryFilter(
            $scope.ejs.FilteredQuery(
              boolQuery,
              filterSrv.getBoolFilter(filterSrv.ids)
            )
          ))
        )
        .size(0);

      $scope.populate_modal(request);

      $scope.data = {};

      request.doSearch().then(function(results) {

        $scope.data.src_terms = [];
        _.each(results.facets.src_terms.terms, function(v) {
          $scope.data.src_terms.push(v.term);
        });
        $scope.data.dst_terms = [];
        _.each(results.facets.dst_terms.terms, function(v) {
          $scope.data.dst_terms.push(v.term);
        });

        console.log("Src terms", $scope.data.src_terms);
        console.log("Dst terms", $scope.data.dst_terms);

        // build a new request to compute the connections between the nodes
        request = $scope.ejs.Request().indices(dashboard.indices);
        _.each($scope.data.src_terms, function(src) {
          _.each($scope.data.dst_terms, function(dst) {
            if (src != dst)
              request = request
                .facet(ejs.FilterFacet(src + '->' + dst)
                .filter(ejs.AndFilter([
                  ejs.TermFilter($scope.panel.src_field, src),
                  ejs.TermFilter($scope.panel.dst_field, dst)
                ]))
                ).size(0);

          });
        });

        request.doSearch().then(function (results) {
          $scope.data.connections = {};
          _.each(results.facets, function(v, name) {
            $scope.data.connections[name] = v.count;
          });

          console.log('Connections: ', $scope.data.connections);

          $scope.panelMeta.loading = false;
          $scope.$emit('render');
        });

      });

      return;
    };

    $scope.populate_modal = function(request) {
      $scope.inspector = angular.toJson(JSON.parse(request.toString()),true);
    };

    $scope.set_refresh = function (state) {
      $scope.refresh = state;
    };

    // useless ?
    $scope.close_edit = function() {
      if($scope.refresh) {
        $scope.get_data();
      }
      $scope.refresh =  false;
      $scope.$emit('render');
    };

    $scope.render = function() {
      $scope.$emit('render');
    };
    // !useless ?
  });

  module.directive('force', function() {
    return {
      restrict: 'A',
      link: function(scope, elem) {
        console.log('link function called');

        elem.html('<center><img src="img/load_big.gif"></center>');


        // Receive render events
        scope.$on('render',function(){
          render_panel();
        });

        // Or if the window is resized
        angular.element(window).bind('resize', function(){
          render_panel();
        });

        function render_panel() {
          console.log('force render event received');
          elem.css({height:scope.panel.height||scope.row.height});
          elem.text('');
          scope.panelMeta.loading = false;

          if (scope.panel.color == null)
              scope.panel.color = "#7ab6b6";

          // compute the nodes and the links
          var links = [], nodes = {};
          var max_value = 0;
          _.each(scope.data.connections, function(v, conn) {
            if (v === 0) {
              return;
            }
            var src = conn.substring(0, conn.indexOf('->')),
              dst = conn.substring(conn.indexOf('->') + 2, conn.length),
              link = {};

            link.source = nodes[src] || (nodes[src] = {name: src});
            link.target = nodes[dst] || (nodes[dst] = {name: dst});

            link.value = v;
            if (v > max_value) {
              max_value = v;
            }

            links.push(link);
          });

          console.log("Links", links);
          console.log("Nodes", d3.values(nodes));

          // add the curvy lines
          function tick() {
            path.attr("d", function(d) {
              var dx = d.target.x - d.source.x,
                dy = d.target.y - d.source.y,
                dr = Math.sqrt(dx * dx + dy * dy);
              return "M" +
                d.source.x + "," +
                d.source.y + "A" +
                dr + "," + dr + " 0 0,1 " +
                d.target.x + "," +
                d.target.y;
            });

            node
              .attr("transform", function(d) {
                return "translate(" + d.x + "," + d.y + ")";
              });
          }

          var style = scope.dashboard.current.style;

          var width = $(elem[0]).width(),
            height = $(elem[0]).height();

          var force = d3.layout.force()
            .nodes(d3.values(nodes))
            .links(links)
            .size([width, height])
            .linkDistance(150)
            .charge(-1200)
            .on("tick", tick)
            .start();

          var svg = d3.select(elem[0]).append("svg")
            .attr("width", width)
            .attr("height", height);

          // build the arrow.
          svg.append("svg:defs").selectAll("marker")
              .data(["end"])      // Different link/path types can be defined here
            .enter().append("svg:marker")    // This section adds in the arrows
              .attr("id", String)
              .attr("viewBox", "0 -5 10 10")
              .attr("refX", 15)
              .attr("refY", -1.5)
              .attr("markerWidth", 6)
              .attr("markerHeight", 6)
              .attr("orient", "auto")
              .style("fill", "#2980b9")
            .append("svg:path")
              .attr("d", "M0,-5L10,0L0,5");

          // add the links and the arrows
          var path = svg.append("svg:g").selectAll("path")
              .data(force.links())
            .enter().append("svg:path")
              .attr("class", "link-path")
              //.attr("marker-end", "url(#end)")
              // Disabled because very hard to put at the right place.
              // Typically "not behind the circle".
              .style('fill', 'none')
              .style('stroke', '#8c8c8c')
              .style('stroke-width', function (link) {
                  return (0.5 + (link.value * 2) / max_value) + 'px';
                });

          // define the nodes
          var node = svg.selectAll(".node")
              .data(force.nodes())
            .enter().append("g")
              .attr("class", "node")
              .call(force.drag);

          var LightenDarkenColor = function(col, amt) {
              var usePound = false;

              if (col[0] == "#") {
                  col = col.slice(1);
                  usePound = true;
              }

              var num = parseInt(col,16);
              var r = (num >> 16) + amt;

              if (r > 255) r = 255;
              else if  (r < 0) r = 0;

              var b = ((num >> 8) & 0x00FF) + amt;

              if (b > 255) b = 255;
              else if  (b < 0) b = 0;

              var g = (num & 0x0000FF) + amt;

              if (g > 255) g = 255;
              else if (g < 0) g = 0;

              return (usePound?"#":"") + (g | (b << 8) | (r << 16)).toString(16);
          }

          // add the nodes
          node.append("circle")
              .attr("r", scope.panel.node_size)
              .style('fill', scope.panel.color)
              .on('mouseover', function(d) {
                console.log('Node: ', d);
                  d3.select(this).style('fill', LightenDarkenColor(scope.panel.color, 40));
                svg.selectAll('.link-path')
                  .filter(function(link) {
                      return link.source === d || link.target === d;
                    })
                  .style('stroke', '#7ab6b6');
              })
              .on('mouseout', function() {
                d3.select(this).style('fill', scope.panel.color);
                svg.selectAll('.link-path')
                  .style('stroke', '#8c8c8c');
              });

          // add the text
          node.append("text")
              .attr("x", 27)
              .attr("dy", ".5em")
              .style('fill', style === 'light' ? '#222' : '#eee')
              .text(function(d) { return d.name; });

        }
      }
    };
  });

});
