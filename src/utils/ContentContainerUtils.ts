// 从 react-native 导入 ViewStyle 类型
import { ViewStyle } from "react-native";
// 从 recyclerlistview-gaw 导入 Dimension 类型
import { Dimension } from "recyclerlistview-gaw";

// 从本地文件导入 ContentStyle 类型
import { ContentStyle } from "../FlashListProps";

/**
 * 定义显式的内容样式接口，包含填充和背景颜色属性。
 */
export interface ContentStyleExplicit {
  /** 顶部填充 */
  paddingTop: number;
  /** 底部填充 */
  paddingBottom: number;
  /** 左侧填充 */
  paddingLeft: number;
  /** 右侧填充 */
  paddingRight: number;
  /** 背景颜色，可选 */
  backgroundColor?: string;
}

/**
 * 更新内容样式，将来源样式的填充和背景颜色应用到目标样式中。
 * @param contentStyle - 目标内容样式对象。
 * @param contentContainerStyleSource - 来源内容容器样式对象，可选。
 * @returns 应用新样式后的显式内容样式对象。
 */
export const updateContentStyle = (
  /** 目标内容样式对象 */
  contentStyle: ContentStyle,
  /** 来源内容容器样式对象，可选 */
  contentContainerStyleSource: ContentStyle | undefined
): ContentStyleExplicit => {
  // 从来源样式中解构出填充和背景颜色属性
  const {
    /** 顶部填充 */
    paddingTop,
    /** 右侧填充 */
    paddingRight,
    /** 底部填充 */
    paddingBottom,
    /** 左侧填充 */
    paddingLeft,
    /** 统一填充 */
    padding,
    /** 垂直方向填充 */
    paddingVertical,
    /** 水平方向填充 */
    paddingHorizontal,
    /** 背景颜色 */
    backgroundColor,
  } = (contentContainerStyleSource ?? {}) as ViewStyle;
  // 更新左侧填充
  contentStyle.paddingLeft = Number(
    paddingLeft || paddingHorizontal || padding || 0
  );
  // 更新右侧填充
  contentStyle.paddingRight = Number(
    paddingRight || paddingHorizontal || padding || 0
  );
  // 更新顶部填充
  contentStyle.paddingTop = Number(
    paddingTop || paddingVertical || padding || 0
  );
  // 更新底部填充
  contentStyle.paddingBottom = Number(
    paddingBottom || paddingVertical || padding || 0
  );
  // 更新背景颜色
  contentStyle.backgroundColor = backgroundColor;
  return contentStyle as ContentStyleExplicit;
};

/**
 * 检查内容容器样式中是否包含不支持的键。
 * @param contentContainerStyleSource - 内容容器样式对象，可选。
 * @returns 如果存在不支持的键，则返回 true；否则返回 false。
 */
export const hasUnsupportedKeysInContentContainerStyle = (
  /** 内容容器样式对象，可选 */
  contentContainerStyleSource: ViewStyle | undefined
) => {
  // 从来源样式中解构出已知属性和剩余属性
  const {
    /** 顶部填充 */
    paddingTop,
    /** 右侧填充 */
    paddingRight,
    /** 底部填充 */
    paddingBottom,
    /** 左侧填充 */
    paddingLeft,
    /** 统一填充 */
    padding,
    /** 垂直方向填充 */
    paddingVertical,
    /** 水平方向填充 */
    paddingHorizontal,
    /** 背景颜色 */
    backgroundColor,
    /** 剩余不支持的样式属性 */
    ...rest
  } = (contentContainerStyleSource ?? {}) as ViewStyle;
  // 检查剩余属性是否存在
  return Object.keys(rest).length > 0;
};

/**
 * Applies padding corrections to given dimension. Mutates the dim object that was passed and returns it.
 * 对给定的维度应用内容容器的填充修正。会修改传入的维度对象并返回它。
 */
export const applyContentContainerInsetForLayoutManager = (
  /** 要修改的维度对象 */
  dim: Dimension,
  /** 内容容器样式对象，可选 */
  contentContainerStyle: ViewStyle | undefined,
  /** 是否为水平布局，可选 */
  horizontal: boolean | undefined | null
) => {
  // 更新内容样式
  const contentStyle = updateContentStyle({}, contentContainerStyle);
  if (horizontal) {
    // 水平布局时，调整高度
    dim.height -= contentStyle.paddingTop + contentStyle.paddingBottom;
  } else {
    // 垂直布局时，调整宽度
    dim.width -= contentStyle.paddingLeft + contentStyle.paddingRight;
  }
  return dim;
};

/**
 * Returns padding to be applied on content container and will ignore paddings that have already been handled.
 * 返回要应用于内容容器的填充，并忽略已经处理过的填充。
 */
export const getContentContainerPadding = (
  /** 显式的内容样式对象 */
  contentStyle: ContentStyleExplicit,
  /** 是否为水平布局，可选 */
  horizontal: boolean | undefined | null
) => {
  if (horizontal) {
    // 水平布局时，返回顶部和底部填充
    return {
      /** 顶部填充 */
      paddingTop: contentStyle.paddingTop,
      /** 底部填充 */
      paddingBottom: contentStyle.paddingBottom,
    };
  } else {
    // 垂直布局时，返回左侧和右侧填充
    return {
      /** 左侧填充 */
      paddingLeft: contentStyle.paddingLeft,
      /** 右侧填充 */
      paddingRight: contentStyle.paddingRight,
    };
  }
};
