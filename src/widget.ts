// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  IKernel
} from 'jupyter-js-services';

import {
  deepEqual, JSONValue
} from 'phosphor/lib/algorithm/json';

import {
  Message
} from 'phosphor/lib/core/messaging';

import {
  Widget, ResizeMessage
} from 'phosphor/lib/ui/widget';

import {
  ABCWidgetFactory, IDocumentModel, IDocumentContext
} from 'jupyterlab/lib/docregistry';

import * as leaflet from 'leaflet';

/**
 * The class name added to a map widget.
 */
const MAP_CLASS = 'jp-MapWidget';


/**
 * A widget for maps.
 */
export
class MapWidget extends Widget {
  /**
   * Construct a new map widget.
   */
  constructor(context: IDocumentContext<IDocumentModel>) {
    super();
    this._context = context;
    this.node.tabIndex = -1;
    this.addClass(MAP_CLASS);

    this._map = leaflet.map(this.node).fitWorld();
    leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution : 'Map data (c) <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        minZoom : 0,
        maxZoom : 18,
    }).addTo(this._map);

    // Since we keep track of the widget size, we monkeypatch the map
    // to use our information instead of doing a DOM read every time it needs
    // the size info. We can stop monkeypatching when we have a size hint change
    // available from leaflet (cf.
    // https://github.com/Leaflet/Leaflet/issues/4200#issuecomment-233616337 and
    // https://github.com/jupyter/jupyterlab/pull/454#discussion_r71349224)
    this._map.getSize = () => {
      let map: any = this._map;
      if (!map._size || map._sizeChanged) {
        if (this._width < 0 || this._height < 0) {
          return map.prototype.getSize.call(map);
        }
        map._size = leaflet.point(this._width, this._height);
        map._sizeChanged = false;
      }
      return map._size.clone();
    };

    context.model.contentChanged.connect(() => {
      this.update();
    });
    context.pathChanged.connect(() => {
      this.update();
    });
  }

  /**
   * Dispose of the resources used by the widget.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._context = null;
    this._map.remove();
    this._map = null;
    this._geojsonLayer = null;
    super.dispose();
  }

  /**
   * A message handler invoked on an `'update-request'` message.
   */
  protected onUpdateRequest(msg: Message): void {
    this.title.label = this._context.path.split('/').pop();
    if (!this.isAttached) {
      return;
    }
    let content = this._context.model.toString();
    let geojson: JSONValue = content ? JSON.parse(content) : content;
    if (deepEqual(geojson, this._geojson)) {
      return;
    }

    // we're attached to the DOM and have new layer content now
    if (this._geojsonLayer) {
      this._map.removeLayer(this._geojsonLayer);
    }
    this._geojson = geojson;
    this._geojsonLayer = null;
    if (geojson) {
      this._geojsonLayer = leaflet.geoJSON(geojson, {
        pointToLayer: function (feature, latlng) {
            return leaflet.circleMarker(latlng);
        }
      });
      this._map.addLayer(this._geojsonLayer);
      this._fitLayerBounds();
    }
  }

  /**
   * A message handler invoked on an `'after-attach'` message.
   */
  protected onAfterAttach(msg: Message): void {
    this.update();
  }

  /**
   * A message handler invoked on an `'activate-request'` message.
   */
  protected onActivateRequest(msg: Message): void {
    this.node.focus();
  }

  /**
   * A message handler invoked on a `'resize'` message.
   */
  protected onResize(msg: ResizeMessage) {
    this._sized = true;
    this._width = msg.width;
    this._height = msg.height;
    this._map.invalidateSize(true);
    this._fitLayerBounds();
  }

  /**
   * Make the map fit the geojson layer bounds only once when all info is available.
   */
  private _fitLayerBounds() {
    if (!this._fitted && this._sized && this._geojsonLayer) {
      this._map.fitBounds(this._geojsonLayer.getBounds(), {});
      this._fitted = true;
    }
  }

  private _fitted = false;
  private _sized = false;
  private _width = -1;
  private _height = -1;
  private _geojson: JSONValue = null;
  private _geojsonLayer: leaflet.GeoJSON;
  private _map: leaflet.Map;
  private _context: IDocumentContext<IDocumentModel>;
}


/**
 * A widget factory for maps.
 */
export
class MapWidgetFactory extends ABCWidgetFactory<MapWidget, IDocumentModel> {
  /**
   * Create a new widget given a context.
   */
  createNew(context: IDocumentContext<IDocumentModel>, kernel?: IKernel.IModel): MapWidget {
    let widget = new MapWidget(context);
    this.widgetCreated.emit(widget);
    return widget;
  }
}
