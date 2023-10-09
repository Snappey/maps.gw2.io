
export type GeoJSON = {
  type: string;
  geometry: {
    type: "Point" | "LineString" | "Polygon" | "MultiPoint" | "MultiLineString" | "MultiPolygon";
    coordinates: [number, number] | [number,number][]
  }
  properties: {
    name: string;
    type: "icon" | "label";
    tooltipText?: string;
    icon?: Icon;
    label?: Label;
  }
}

export type Label = {
  class?: "heading" | "subheading" | "label";
  text?: string;
  colour?: `#${string}`;
}

export type Icon = {
  type?: "canvas" | "divIcon";
  url?: string;
  size?: [number, number];
  chatLink?: `[${string}]`;
}

export type Category = {
  name: string
  layer: GeoJSON[]
  children?: Category[]
}

const example: Category = {
  name: "A Top Level Category",
  layer: [],
  children: [
    {
      name: "Some Subcategory",
      layer: []
    }, {
      name: "Another Subcategory",
      layer: []
    },
  ]
}
