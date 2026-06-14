declare module "react-simple-maps" {
  import type { ReactNode, SVGProps, ForwardRefExoticComponent, RefAttributes, Context } from "react";

  export interface ProjectionConfig {
    scale?: number;
    center?: [number, number];
    rotate?: [number, number, number];
  }

  export interface ComposableMapProps extends SVGProps<SVGSVGElement> {
    projection?: string | ((width: number, height: number) => unknown);
    projectionConfig?: ProjectionConfig;
    width?: number;
    height?: number;
    className?: string;
    children?: ReactNode;
  }

  export const ComposableMap: ForwardRefExoticComponent<ComposableMapProps & RefAttributes<SVGSVGElement>>;

  export interface GeographiesChildrenProps {
    geographies: Record<string, unknown>[];
    outline: Record<string, unknown>;
    graticule: Record<string, unknown>;
  }

  export interface GeographiesProps {
    geography: string | Record<string, unknown>;
    children: (props: GeographiesChildrenProps) => ReactNode;
  }

  export function Geographies(props: GeographiesProps): JSX.Element;

  export interface GeographyProps extends SVGProps<SVGPathElement> {
    geography: Record<string, unknown>;
    style?: {
      default?: Record<string, unknown>;
      hover?: Record<string, unknown>;
      pressed?: Record<string, unknown>;
    };
  }

  export function Geography(props: GeographyProps): JSX.Element;

  export interface MarkerProps extends SVGProps<SVGGElement> {
    coordinates: [number, number];
    children?: ReactNode;
  }

  export function Marker(props: MarkerProps): JSX.Element;

  export interface LineProps extends SVGProps<SVGPathElement> {
    from: [number, number];
    to: [number, number];
    coordinates?: [number, number][];
  }

  export function Line(props: LineProps): JSX.Element;

  export interface MapContextValue {
    path: (feature: unknown) => string | null;
    projection: ((coords: [number, number]) => [number, number] | null) | null;
    width: number;
    height: number;
  }

  export function useMapContext(): MapContextValue;
  export const MapContext: Context<MapContextValue>;

  export function MapProvider(props: {
    children?: ReactNode;
    width?: number;
    height?: number;
    projection?: string | ((w: number, h: number) => unknown);
    projectionConfig?: ProjectionConfig;
  }): JSX.Element;

  export function ZoomableGroup(props: {
    children?: ReactNode;
    center?: [number, number];
    zoom?: number;
    [key: string]: unknown;
  }): JSX.Element;

  export function Graticule(props: SVGProps<SVGPathElement>): JSX.Element;
  export function Sphere(props: SVGProps<SVGPathElement>): JSX.Element;

  export function Annotation(props: {
    subject: [number, number];
    children?: ReactNode;
    [key: string]: unknown;
  }): JSX.Element;
}
