import {
  SyntheticViewMetadata,
  SyntheticViewType,
  SYNTHETIC_VIEW_DISCLAIMER,
} from './pose.types';

export function createSyntheticViewMetadata(
  viewType: SyntheticViewType,
): SyntheticViewMetadata {
  return {
    viewType,
    isInferred: true,
    isSynthetic: true,
    disclaimer: SYNTHETIC_VIEW_DISCLAIMER,
  };
}

export const AVAILABLE_VIEWS: SyntheticViewType[] = [
  'front',
  'rear',
  'left_lateral',
  'right_lateral',
  'orbit',
];
