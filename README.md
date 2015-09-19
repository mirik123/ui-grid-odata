# ui-grid-odata

This plugin allows querying for odata v3/v4 services.<br/>
I first implemented this idea in free-jqgrid project: [grid.odata.js](https://github.com/free-jqgrid/jqGrid/blob/master/plugins/grid.odata.js), [wiki](https://github.com/free-jqgrid/jqGrid/wiki/OData-plugin-for-jqGrid).<br/>
You can compare it with the angular implementation to see the differences between jqGrid and Angular development. <br/>

The odata plugin requires no external 3rd party packages like breeze.js or datajs.js.<br/>
Its only dependency is the [ui-grid-expandable](https://github.com/angular-ui/ui-grid/tree/master/src/features/expandable) plugin.<br/>

The angular ui-grid-odata feature does the following: 
* Queries odata source by the $http provider.
* Parses $metadata response to the plain JavaScript object.
* Builds ui-grid column definitions based on odata metadata.
* When NavigationProperties exist - configures ui-grid-expandable feature and builds multilevel subgrids.
* TODO: implement verbs $count, $skip, $top, $orderby for paging and sorting; together with ui-grid-pagination
* TODO: implement verb $filter for filtering. 

## Public API
**expandRow (row, col, rowRenderIndex, $event)**<br/>
*{row} - grid row object*<br/>
*{col} - grid col object (if missing, the first column references NavigationProperty or ComplexType is used)*<br/>
*{rowRenderIndex} - grid row $index*<br/>
*{$event} - grid $event*<br/>
Used inside row template. Builds column definitions and data for subgrid (requires ui-grid-expandable directive).
````Html
    <div class="ui-grid-cell-contents"><a style="cursor:pointer" class="SubgridTemplate" ng-click="grid.options.odata.expandRow(row, col, rowRenderIndex, $event)">{{col.displayName}}</a></div>
````

**genColumnDefs (grid, hasExpandable, callback)**<br/>
*{grid} - reference to the main grid*<br/>
*{hasExpandable} -parameter is true when ui-grid-expandable directive is applied on the main grid.*<br/>
*{callback} - callback function to be called instead of the default success event.*<br/>
Queries odata $metadata and builds grid.columnDefs, initializes ui-grid-expandable feature.

**parseMetadata (data, expandable)**<br/>
*{data} -  odata $metadata in xml format*<br/>
*{expandable} - the expantion type of the odata feature: subgrid,link,json*<br/>
Parses odata $metadata in xml format to the plain javascript object.
````JavaScript
 $http.get('http://services.odata.org/V4/OData/OData.svc/$metadata', {dataType: 'xml'}).then(function (response) {
      var colModels = $this.parseMetadata(response.data, 'subgrid');
 });
````

## Events
success(grid)
```` 
grid.api.odata.raise.success(grid);
````
error(data, message)
```` 
grid.api.odata.raise.error(response, 'failed to query $metadata'); 
````
 
## Script example:
````JavaScript
     var app = angular.module('app', ['ui.grid', 'ui.grid.expandable', 'ui.grid.odata']);
     app.controller('MainCtrl', ['$scope', 'gridUtil', function ($scope, gridUtil) {
        $scope.myGrid = {
            expandableRowTemplate: 'ui-grid/odataExpandableRowTemplate',
            odata: {
                metadatatype: 'xml',
                datatype: 'json',
                expandable: 'subgrid',  //can be also 'link' or 'json'
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
````

````HTML
<div ng-controller="MainCtrl">
     <div id="grid1" ui-grid="myGrid" ui-grid-odata ui-grid-expandable></div>
</div>
````

View demo in codepen http://codepen.io/mirik123/pen/ZbboKV

