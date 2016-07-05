/*
 * OData plugin for ui-grid
 *
 * Copyright (c) 2014-2015, Mark Babayev (https://github.com/mirik123) markolog@gmail.com
 * License MIT (MIT-LICENSE.txt)
 *
 * The idea for creating client adapter for quering odata services first appeared in free-jqgrid project.
 * After that it has been converted and adopted for angular.js
 */

(function () {
    'use strict';

    /**
     * @ngdoc overview
     * @name ui.grid.odata
     * @description
     *
     * # ui.grid.odata
     *
     * <div class="alert alert-warning" role="alert"><strong>Alpha</strong> This feature is in development. There will almost certainly be breaking api changes, or there are major outstanding bugs.</div>
     *
     * This module provides the ability to query the odata services by the angular ui-grid client.
     *
     * <div doc-module-components="ui.grid.odata"></div>
     */
    var module = angular.module('ui.grid.odata', ['ui.grid']);

    module.run(['$templateCache', function ($templateCache) {
        $templateCache.put('ui-grid/odataExpandableRowTemplate', '<div ui-grid="row.entity.subGridOptions" ui-grid-expandable></div>'); //expandableRowScope

        $templateCache.put('ui-grid/odataSubgridTemplate',
            '<div class="ui-grid-cell-contents" title="TOOLTIP"><a style="cursor:pointer" class="SubgridTemplate" ng-click="grid.options.odata.expandRow(row, col, rowRenderIndex, $event)">{{col.displayName}}</a></div>');

        $templateCache.put('ui-grid/odataLinkTemplate',
            '<div class="ui-grid-cell-contents" title="TOOLTIP"><a style="cursor:pointer" class="LinkTemplate" ng-href="{{grid.options.odata.dataurl + (grid.options.odata.iscollection ? \'(\'+row.entity[grid.options.odata.key]+\')\' : \'\') + \'/\' + col.name}}">{{col.name}}</a></div>');

        $templateCache.put('ui-grid/odataEdmGeographyPoint',
            '<div class="ui-grid-cell-contents" title="TOOLTIP"><div class="EdmGeographyPoint">{{COL_FIELD | EdmGeographyPoint:"x"}}</div><div>{{COL_FIELD | EdmGeographyPoint:"y"}}</div></div>');
    }]);

    /**
     *  @ngdoc filter
     *  @name ui.grid.odata.filter:EdmGeographyPoint
     *  @description Example filter for odata feature. It is used for Edm.GeographyPoint odata type.
     */
    module.filter('EdmGeographyPoint', function () {
        return function (input, coord) {
            if (input.coordinates && input.coordinates.length > 0) {
                return coord === 'x' ? 'x:' + input.coordinates[0].toFixed(2): 'y:' + input.coordinates[1].toFixed(2);
            }

            return input;
        };
    });

    /**
     *  @ngdoc filter
     *  @name ui.grid.odata.filter:EdmDateTimeOffset
     *  @description Example filter for odata feature. It is used for Edm.DateTimeOffset odata type.
     */
    module.filter('EdmDateTimeOffset', function () {
        return function (input) {
            return input ? new Date(input).toDateString() : null;
        };
    });

    /**
     *  @ngdoc service
     *  @name ui.grid.odata.service:uiGridODataService
     *  @description Service for odata feature.
     */
    module.service('uiGridODataService', ['$http', '$injector', '$templateCache', 'uiGridConstants', 'gridUtil', function ($http, $injector, $templateCache, uiGridConstants, gridUtil) {
        function format (text) {
            var args = arguments;
            if (!text) {
                return undefined;
            }
            return text.replace(/\{\{|\}\}|\{(\d+)\}/g, function (m, n) {
                if (m === "{{") {
                    return "{";
                }
                if (m === "}}") {
                    return "}";
                }
                return args[parseInt(n, 10) + 1];
            });
        }

        function concat () {
            var i, j, res = [];
            for (i = 0; i < arguments.length; i++) {
                if (arguments[i]) {
                    for (j = 0; j < arguments[i].length; j++) {
                        if (arguments[i][j]) {
                            res.push(arguments[i][j]);
                        }
                    }
                }
            }
            return res;
        }

        function onRootRegisterApi (registerApiOrig, gridscope) {
            return function (gridApi) {
                if (angular.isFunction(registerApiOrig)) {
                    registerApiOrig(gridApi);
                }

                var dataChangeDereg = gridApi.grid.registerDataChangeCallback(
                    function() {
                        //repeats ui-grid-expandable initialization directive
                        //https://github.com/angular-ui/ui-grid/blob/master/src/features/expandable/js/expandable.js
                        if(this.options.enableExpandableRowHeader !== false && this.columns.filter(function(itm) {return itm.name === 'expandableButtons';}).length === 0) {
                            var expandableRowHeaderColDef = {
                                name: 'expandableButtons',
                                displayName: '',
                                exporterSuppressExport: true,
                                enableColumnResizing: false,
                                enableColumnMenu: false,
                                width: this.options.expandableRowHeaderWidth || 40,
                                cellTemplate: $templateCache.get('ui-grid/expandableRowHeader'),
                                headerCellTemplate: $templateCache.get('ui-grid/expandableTopRowHeader')
                            };
                            this.addRowHeaderColumn(expandableRowHeaderColDef);
                        }

                        dataChangeDereg();
                    },
                    [uiGridConstants.dataChange.COLUMN],
                    gridApi.grid
                );

                if(gridApi.expandable) {
                    gridApi.expandable.on.rowExpandedStateChanged(gridscope, function (row) {
                        if(row.$$fake) {
                            row.$$fake = false;
                            return;
                        }

                        var col = row.grid.options.columnDefs.filter(function (itm) {
                            return itm.odata.expand === 'subgrid';
                        })[0];
                        if (col) {
                            row.grid.options.odata.expandRow(row, col);
                        }
                    });
                }
            };
        }

        function onRegisterApi (registerApiOrig, gridscope) {
            return function (gridApi) {
                if(!gridApi.odata) {
                    gridApi.registerEventsFromObject(publicApi.events);
                    gridApi.registerMethodsFromObject(publicApi.methods);
                }

                if (angular.isFunction(registerApiOrig)) {
                    registerApiOrig(gridApi);
                }

                gridApi.grid.registerDataChangeCallback(
                    function() {
                        if (this.parentRow && this.rows.length > 0){
                            this.parentRow.expandedRowHeight = this.gridHeight;
                            //this.parentRow.height = this.parentRow.grid.options.rowHeight + (this.parentRow.isExpanded ? this.gridHeight : 0);

                            var origHeight = this.parentRow.grid.gridHeight;//parseInt(this.parentRow.grid.element.css('height').replace('px', ''), 10);
                            var newHeight = origHeight + (this.parentRow.isExpanded ? 1 : -1) * this.gridHeight;
                            this.parentRow.grid.element.css('height', newHeight + 'px');
                            this.parentRow.grid.gridHeight = newHeight;

                            //this.api.core.handleWindowResize();
                        }
                    },
                    [uiGridConstants.dataChange.ROW],
                    gridApi.grid
                );

                if(gridApi.expandable) {
                    gridApi.expandable.on.rowExpandedStateChanged(gridscope, function (row) {
                        if(row.$$fake) {
                            row.$$fake = false;
                            return;
                        }

                        var col = row.grid.options.columnDefs.filter(function (itm) {
                            return itm.odata.expand === 'subgrid';
                        })[0];
                        if (col) {
                            row.grid.options.odata.expandRow(row, col);
                        }
                    });
                }
            };
        }

        /**
         * @ngdoc method
         * @methodOf ui.grid.odata.service:uiGridODataService
         * @name expandRow
         * @description  Builds column definitions and data for subgrid (requires ui-grid-expandable directive).
         * @example
         * <pre>
         *     <div class="ui-grid-cell-contents"><a style="cursor:pointer" class="SubgridTemplate" ng-click="grid.options.odata.expandRow(row, col, rowRenderIndex, $event)">{{col.displayName}}</a></div>
         * </pre>
         * @param {row} grid row object
         * @param {col} grid col object (if missing, the first column references NavigationProperty or ComplexType is used)
         * @param {rowRenderIndex} grid row $index
         * @param {$event} grid $event
         */
        function expandRow (row, col, rowRenderIndex, $event) {
            var grid = row.grid;
            var colodata = col.colDef && col.colDef.odata || col.odata;

            var dataurl;
            var row_id = grid.options.odata.key ? row.entity[grid.options.odata.key] : rowRenderIndex;
            if (grid.options.odata.iscollection) {
                dataurl = format('{0}({1})/{2}', grid.options.odata.dataurl, row_id, col.name);
            }
            else {
                dataurl = format('{0}/{1}', grid.options.odata.dataurl, col.name);
            }

            var keyColumn = grid.options.odata.subgridCols[col.name].filter(function (itm) {return itm.odata.iskey;})[0];
            if (keyColumn) {
                keyColumn = keyColumn.name;
            }

            row.entity.subGridOptions = angular.merge({}, grid.options, {columnDefs: null, data: null});
            angular.merge(row.entity.subGridOptions, {
                columnDefs: grid.options.odata.subgridCols[col.name],
                odata: angular.merge({}, colodata, {
                    dataurl: dataurl,
                    entitySet: col.name,
                    key: keyColumn
                }),
                onRegisterApi: onRegisterApi(grid.options.odata.rootRegisterApi, grid.appScope)
            });

            row.entity.subGridOptions.enableExpandable =
                    row.entity.subGridOptions.odata.expandable === 'subgrid' &&
                    row.entity.subGridOptions.columnDefs.some(function (itm) {return itm.odata.expand === 'subgrid';});

            row.entity.subGridOptions.enableExpandableRowHeader = row.entity.subGridOptions.enableExpandable;

            $http.get(row.entity.subGridOptions.odata.dataurl, {dataType: 'json'})
                .success(function (data) {
                    if (colodata.iscollection && !data.value) {
                        grid.api.odata.raise.error(null, 'data is empty');
                        return;
                    }

                    data = data.value || [data];
                    row.entity.subGridOptions.minRowsToShow = data.length;

                    if ($event) {
                        //copied from grid.api.expandable.toggleRowExpansion(row.entity);
                        row.isExpanded = !row.isExpanded;
                        if (!row.isExpanded) {
                            grid.expandable.expandedAll = false;
                        }

                        row.$$fake = true;
                        grid.api.expandable.raise.rowExpandedStateChanged(row);
                    }

                    window.setTimeout(function() {
                        row.entity.subGridOptions.data = data;
                    }, 0);
                });
        }

        var publicApi = {
            events: {
                odata: {
                    success: function(grid) {},
                    error: function (data, message) {}
                }
            },
            methods: {
                odata: {
                    parseMetadata: function (data, expandable) { return service.parseMetadata(data, expandable); },
                    genColumnDefs: function(grid, hasExpandable) { return service.genColumnDefs(grid, hasExpandable); }
                }
            }
        };

        var service = {
            /**
             * @ngdoc method
             * @methodOf ui.grid.odata.service:uiGridODataService
             * @name parseMetadata
             * @description  Parses odata $metadata in xml format to the plain javascript object.
             * <pre>
             *  $http.get('http://services.odata.org/V4/OData/OData.svc/$metadata', {dataType: 'xml'}).then(function (response) {
             *       var colModels = $this.parseMetadata(response.data, 'subgrid');
             *  });
             * </pre>
             * @param {data} odata $metadata in xml format
             * @param {expandable} the expantion type of the odata feature: subgrid,link,json
             */
            parseMetadata: function (data, expandable) {
                var entities = {}, complexes = {}, mdata = {}, i, j, n, cols, props, keys, key, namespace, entityType, attr, nullable;
                var isNum, isDate, isBool, entityValues = [], iskey, name, type, isComplex, isNavigation, isCollection;
                var numTypes = 'Edm.Int16,Edm.Int32,Edm.Int64,Edm.Decimal,Edm.Double,Edm.Single';
                var boolTypes = 'Edm.Byte,Edm.SByte';

                namespace = angular.element(data).find('Schema').attr('Namespace') + '.';
                var arr = angular.element(data).find('EntityContainer').find('EntitySet');
                for (i = 0; i < arr.length; i++) {
                    entities[angular.element(arr[i]).attr('EntityType').replace(namespace, '')] = angular.element(arr[i]).attr('Name');
                    entityValues.push(angular.element(arr[i]).attr('Name'));
                }

                arr = angular.element(data).find('ComplexType');
                for (i = 0; i < arr.length; i++) {
                    complexes[angular.element(arr[i]).attr('Name')] = angular.element(arr[i]).attr('Name');
                }

                arr = concat(arr, angular.element(data).find('EntityType'));
                for (i = 0; i < arr.length; i++) {
                    props = concat(angular.element(arr[i]).find('Property'), angular.element(arr[i]).find('NavigationProperty'));
                    keys = angular.element(arr[i]).find('Key').find('PropertyRef');
                    key = keys && keys.length > 0 ? angular.element(keys[0]).attr('Name') : '';
                    entityType = angular.element(arr[i]).attr('Name');

                    if (props) {
                        cols = [];
                        for (j = 0; j < props.length; j++) {
                            attr = {};
                            for (n = 0; n < props[j].attributes.length; n++) {
                                attr[props[j].attributes[n].name] = props[j].attributes[n].value;
                            }

                            iskey = attr.name === key;
                            name = attr.name;
                            type = attr.type;
                            nullable = attr.nullable;
                            isComplex = props[j].localName.toLowerCase() === 'property' && !!complexes[attr.name];
                            isNavigation = props[j].localName.toLowerCase() === 'navigationproperty';
                            isCollection = entityValues.indexOf(name) >= 0;
                            isNum = numTypes.indexOf(type) >= 0;
                            isBool = boolTypes.indexOf(type) >= 0;
                            isDate = type && (type.indexOf('Edm.') >= 0 && (type.indexOf('Date') >= 0 || type.indexOf('Time') >= 0));

                            cols.push({
                                displayName: name,
                                field: name,
                                name: name,
                                type: (iskey || isNavigation || isComplex) ? 'object' : isNum ? 'number' : isDate ? 'date' : isBool ? 'boolean' : 'text',
                                cellFilter: $injector.has(type.replace('.', '') + 'Filter') ? type.replace('.', '') : isComplex ? 'json' : undefined,
                                headerTooltip: type,
                                cellTemplate: isNavigation && expandable === 'subgrid' ? 'ui-grid/odataSubgridTemplate' :
                                    isNavigation && expandable === 'link' ? 'ui-grid/odataLinkTemplate' :
                                        ($templateCache.get('ui-grid/odata' + type.replace('.', '')) ? 'ui-grid/odata' + type.replace('.', '') : 'ui-grid/uiGridCell'),
                                odata: {
                                    expand: isNavigation ? expandable : isComplex ? 'json' : null,
                                    isnavigation: isNavigation,
                                    iscomplex: isComplex,
                                    iscollection: isCollection,
                                    iskey: iskey
                                }
                            });
                        }

                        if (entities[entityType]) {
                            mdata[entities[entityType]] = cols;
                        }
                        mdata[entityType] = cols;
                    }
                }

                return mdata;
            },

            /**
             * @ngdoc method
             * @methodOf ui.grid.odata.service:uiGridODataService
             * @name genColumnDefs
             * @description  Queries odata $metadata and builds grid.columnDefs, initializes ui-grid-expandable feature.
             * @param {grid} reference to the main grid
             * @param {hasExpandable} parameter is true when ui-grid-expandable directive is applied on the main grid.
             * @param {callback} callback function to be called instead of the default success event.
             */
            genColumnDefs: function (grid, hasExpandable, callback) {
                var $this = this;

                grid.options.odata = angular.merge({
                    metadataurl: grid.options.odata.dataurl + '/$metadata',
                    metadatatype: 'application/xml',
                    expandable: 'subgrid',
                    entitySet: null,
                    expandRow: function (row, col, rowRenderIndex, $event) {
                        return expandRow(row, col, rowRenderIndex, $event);
                    },
                    rootRegisterApi: grid.options.onRegisterApi
                }, grid.options.odata);

                grid.options.onRegisterApi = onRootRegisterApi(grid.options.odata.rootRegisterApi, grid.appScope);
                grid.options.enableExpandableRowHeader = false;
                grid.options.minRowsToShow = 1;

                if(!grid.options.expandableRowTemplate) {
                    grid.options.expandableRowTemplate = 'ui-grid/odataExpandableRowTemplate';
                }

                if (!grid.options.odata.entitySet) {
                    grid.api.odata.raise.error(null, 'entitySet cannot be empty');
                    return;
                }

                $http.get(grid.options.odata.metadataurl, 
                    {
                        headers: { 'Accept': grid.options.odata.metadatatype }
                    })
                    .then(function (response) {
                        var colModels = $this.parseMetadata(response.data, grid.options.odata.expandable);
                        if (!colModels || !colModels[grid.options.odata.entitySet]) {
                            grid.api.odata.raise.error(null, 'failed to parse metadata');
                            return;
                        }

                        var keyColumn = colModels[grid.options.odata.entitySet].filter(function (itm) {return itm.odata.iskey;})[0];
                        if (keyColumn) {
                            keyColumn = keyColumn.name;
                        }

                        grid.options.enableExpandable =
                                grid.options.odata.expandable === 'subgrid' &&
                                colModels[grid.options.odata.entitySet].some(function (itm) {return itm.odata.expand === 'subgrid';});

                        if(grid.options.enableExpandable && !hasExpandable) {
                            grid.api.odata.raise.error(response, 'missing ui-grid-expandable directive');
                            grid.options.enableExpandable = false;
                        }

                        if(!grid.options.enableExpandable && grid.options.odata.expandable === 'subgrid') {
                            grid.options.odata.expandable = 'link';
                        }

                        grid.options.enableExpandableRowHeader = grid.options.enableExpandable;

                        var columnDefs = colModels[grid.options.odata.entitySet];
                        if(grid.options.columnDefs && grid.options.columnDefs.length > 0) {
                            var i,j;
                            for(i=0;i<columnDefs.length;i++){
                                for(j=0;j<grid.options.columnDefs.length;j++){
                                    if(columnDefs[i].field === grid.options.columnDefs[j].field) {
                                        angular.merge(columnDefs[i], grid.options.columnDefs[j]);
                                    }
                                }
                            }
                        }

                        angular.merge(grid.options, {
                            odata: {
                                iscollection: true,
                                subgridCols: colModels,
                                key: keyColumn
                            },
                            columnDefs: columnDefs
                        });

                        if(angular.isFunction(callback)) {
                            callback();
                        }
                        else {
                            grid.api.odata.raise.success(grid);
                        }
                    },
                    function (response) {
                        grid.api.odata.raise.error(response, 'failed to query $metadata');
                    });
            },

            /**
             * @ngdoc method
             * @methodOf ui.grid.odata.service:uiGridODataService
             * @name initialize
             * @description  Initilizes grid, calls for genColumnDefs when gencolumns=true and, finally queries for data.
             * @param {grid} reference to the main grid
             * @param {hasExpandable} parameter is true when ui-grid-expandable directive is applied on the main grid.
             */
            initializeGrid: function (grid, hasExpandable) {
                grid.api.registerEventsFromObject(publicApi.events);
                grid.api.registerMethodsFromObject(publicApi.methods);
                var $this = this;

                grid.options.odata = angular.merge({
                    datatype: 'application/json',
                    gencolumns: true
                }, grid.options.odata);

                var callback = function () {
                    $http.get(grid.options.odata.dataurl, 
                    {
                        headers: { 'Accept': grid.options.odata.datatype }
                    })
                        .then(function (response) {
                            var data = response.data && response.data.value || [];

                            grid.options.minRowsToShow = data.length;
                            if(grid.options.minRowsToShow > 1) {
                                var newHeight = grid.gridHeight + (grid.options.minRowsToShow - 1) * grid.options.rowHeight;
                                grid.element.css('height', newHeight + 'px');
                                grid.gridHeight = newHeight;
                            }

                            grid.options.data = data;
                            grid.api.odata.raise.success(grid);
                        },
                        function (response) {
                            grid.api.odata.raise.error(response, 'failed to query dataurl');
                        });
                };

                if (!grid.options.odata.dataurl) {
                    grid.api.odata.raise.error(null, 'dataurl cannot be empty');
                    return;
                }

                if (grid.options.odata.gencolumns) {
                    $this.genColumnDefs(grid, hasExpandable, callback);
                }
                else {
                    callback();
                }
            }
        };

        return service;
    }]);

    /**
     *  @ngdoc directive
     *  @name ui.grid.odata.directive:uiGridOdata
     *  @description stacks on the uiGrid directive to init grid for working with odata server.
     *  @example
     <example module="app">
     <file name="app.js">
     var app = angular.module('app', ['ui.grid', 'ui.grid.expandable', 'ui.grid.odata']);
     app.controller('MainCtrl', ['$scope', 'gridUtil', function ($scope, gridUtil) {
        $scope.myGrid = {
            expandableRowTemplate: 'ui-grid/odataExpandableRowTemplate',
            odata: {
                metadatatype: 'xml',
                datatype: 'json',
                expandable: 'subgrid',
                entitySet: 'Products',
                dataurl: "http://services.odata.org/V4/OData/OData.svc/Products",
                metadataurl: 'http://services.odata.org/V4/OData/OData.svc/$metadata',
                gencolumns: true
            }
        };

        $scope.myGrid.onRegisterApi = function (gridApi) {
            gridApi.expandable.on.rowExpandedStateChanged($scope, function(row) {
                gridUtil.logDebug('expanded: ' + row.entity.Description);
            });

            gridApi.odata.on.success($scope, function(grid) {
                gridUtil.logDebug('succeeded');
            });

            gridApi.odata.on.error($scope, function(data, message) {
                gridUtil.logError(message);
            });
        };
     }]);
     </file>
     <file name="index.html">
     <div ng-controller="MainCtrl">
     <div id="grid1" ui-grid="myGrid" ui-grid-odata ui-grid-expandable></div>
     </div>
     </file>
     </example>
     */
    module.directive('uiGridOdata', ['uiGridODataService', function(uiGridODataService) {
        return {
            restrict: 'A',
            replace: true,
            priority: 10,
            require: '^uiGrid',
            scope: false,
            compile: function () {
                return {
                    pre: function ($scope, $elm, $attrs, uiGridCtrl) {
                        if (uiGridCtrl.grid.options.enableOdata !== false) {
                            uiGridCtrl.grid.element = $elm;
                            var hasExpandable = 'uiGridExpandable' in $attrs;
                            uiGridODataService.initializeGrid(uiGridCtrl.grid, hasExpandable);
                        }
                    }
                };
            }
        };
    }]);
})();
