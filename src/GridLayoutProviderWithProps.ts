// 从 recyclerlistview-gaw 模块导入所需的类型和类
import {
  Dimension,
  GridLayoutProvider,
  Layout,
  LayoutManager,
} from "recyclerlistview-gaw";

// 从本地文件导入 FlashListProps 类型
import { FlashListProps } from "./FlashListProps";
// 从工具文件导入 AverageWindow 类
import { AverageWindow } from "./utils/AverageWindow";
// 从工具文件导入处理内容容器插入的函数
import { applyContentContainerInsetForLayoutManager } from "./utils/ContentContainerUtils";

/**
 * 继承自 GridLayoutProvider 的类，带有额外的属性和方法，用于处理 FlashList 的布局。
 * @template T - 数据项的类型。
 */
export default class GridLayoutProviderWithProps<T> extends GridLayoutProvider {
  /** 存储 FlashList 的属性 */
  private props: FlashListProps<T>;
  /** 用于存储布局信息的对象 */
  private layoutObject = { span: undefined, size: undefined };
  /** 用于计算项目平均大小的窗口对象 */
  private averageWindow: AverageWindow;
  /** 渲染窗口的边距 */
  private renderWindowInsets: Dimension = { width: 0, height: 0 };
  /** 标记布局提供器是否已过期 */
  private _hasExpired = false;
  /** 默认的估计项目大小 */
  public defaultEstimatedItemSize = 100;

  /**
   * 构造函数，初始化 GridLayoutProviderWithProps 实例。
   * @param maxSpan - 最大跨度或总列数。
   * @param getLayoutType - 一个函数，用于获取给定索引的项目布局类型。
   * @param getSpan - 一个函数，用于获取给定索引的项目跨度。
   * @param getHeightOrWidth - 一个函数，用于获取给定索引的项目高度或宽度。
   * @param props - FlashList 的属性。
   * @param acceptableRelayoutDelta - 可接受的重新布局差异，可选参数。
   */
  constructor(
    maxSpan: number,
    getLayoutType: (
      index: number,
      props: FlashListProps<T>,
      mutableLayout: { span?: number; size?: number }
    ) => string | number,
    getSpan: (
      index: number,
      props: FlashListProps<T>,
      mutableLayout: { span?: number; size?: number }
    ) => number,
    getHeightOrWidth: (
      index: number,
      props: FlashListProps<T>,
      mutableLayout: { span?: number; size?: number }
    ) => number | undefined,
    props: FlashListProps<T>,
    acceptableRelayoutDelta?: number
  ) {
    // 调用父类的构造函数
    super(
      maxSpan,
      (i) => {
        // 获取给定索引的项目布局类型
        return getLayoutType(i, this.props, this.getCleanLayoutObj());
      },
      (i) => {
        // 获取给定索引的项目跨度
        return getSpan(i, this.props, this.getCleanLayoutObj());
      },
      (i) => {
        // 获取给定索引的项目高度或宽度，如果开发者未提供覆盖值，则使用平均项目大小
        return (
          getHeightOrWidth(i, this.props, this.getCleanLayoutObj()) ??
          this.averageItemSize
        );
      },
      acceptableRelayoutDelta
    );
    // 存储 FlashList 的属性
    this.props = props;
    // 初始化平均窗口对象
    this.averageWindow = new AverageWindow(
      1,
      props.estimatedItemSize ?? this.defaultEstimatedItemSize
    );
    // 调整渲染窗口的大小
    this.renderWindowInsets = this.getAdjustedRenderWindowSize(
      this.renderWindowInsets
    );
  }

  /**
   * 更新布局提供器的属性。
   * @param props - 新的 FlashList 属性。
   * @returns 更新后的 GridLayoutProviderWithProps 实例。
   */
  public updateProps(props: FlashListProps<T>): GridLayoutProviderWithProps<T> {
    // 应用内容容器边距到布局管理器
    const newInsetValues = applyContentContainerInsetForLayoutManager(
      {
        height: 0,
        width: 0,
      },
      props.contentContainerStyle,
      Boolean(props.horizontal)
    );
    // 判断布局提供器是否已过期
    this._hasExpired =
      this._hasExpired ||
      this.props.numColumns !== props.numColumns ||
      newInsetValues.height !== this.renderWindowInsets.height ||
      newInsetValues.width !== this.renderWindowInsets.width;

    console.log("__zyf__ updateProps contentStyle", newInsetValues)
    // 更新渲染窗口的边距
    this.renderWindowInsets = newInsetValues;
    // 更新 FlashList 的属性
    this.props = props;
    return this;
  }

  /**
   * This methods returns true if the layout provider has expired and needs to be recreated.
   * This can happen if the number of columns has changed or the render window size has changed in a way that cannot be handled by the layout provider internally.
   * 该方法返回布局提供器是否已过期，是否需要重新创建。
   * 当列数发生变化或渲染窗口大小的变化无法由布局提供器内部处理时，可能会发生这种情况。
   */
  public get hasExpired() {
    return this._hasExpired;
  }

  /**
   * Calling this method will mark the layout provider as expired. As a result, a new one will be created by FlashList and old cached layouts will be discarded.
   * 调用此方法将标记布局提供器已过期。因此，FlashList 会创建一个新的布局提供器，并且旧的缓存布局将被丢弃。
   */
  public markExpired() {
    this._hasExpired = true;
  }

  /**
   * Calling this method will help the layout provider track average item sizes on its own
   * Overriding layout manager can help achieve the same thing without relying on this method being called however, it will make implementation very complex for a simple use case
   * @param index Index of the item being reported
   * 调用此方法将帮助布局提供器自行跟踪项目的平均大小。
   * 重写布局管理器可以在不依赖调用此方法的情况下实现相同的功能，但是对于简单的用例来说，这会使实现变得非常复杂。
   * @param index - 正在报告的项目的索引。
   */
  public reportItemLayout(index: number) {
    const layout = this.getLayoutManager()?.getLayouts()[index];
    if (layout) {
      // For the same index we can now return different estimates because average is updated in realtime
      // Marking the layout as overridden will help layout manager avoid using the average after initial measurement
      // 对于相同的索引，我们现在可以返回不同的估计值，因为平均值是实时更新的。
      // 将布局标记为已覆盖将帮助布局管理器在首次测量后避免使用平均值。
      layout.isOverridden = true;
      this.averageWindow.addValue(
        this.props.horizontal ? layout.width : layout.height
      );
    }
  }

  /**
   * 获取项目的平均大小。
   */
  public get averageItemSize() {
    return this.averageWindow.currentValue;
  }

  /**
   * 创建一个新的布局管理器。
   * 平均窗口会在创建新的布局管理器时更新，因为旧的值不再相关。
   * @param renderWindowSize - 渲染窗口的大小。
   * @param isHorizontal - 是否为水平列表，可选参数。
   * @param cachedLayouts - 缓存的布局数组，可选参数。
   * @returns 新的布局管理器实例。
   */
  public newLayoutManager(
    renderWindowSize: Dimension,
    isHorizontal?: boolean,
    cachedLayouts?: Layout[]
  ): LayoutManager {
    // Average window is updated whenever a new layout manager is created. This is because old values are not relevant anymore.
    // 计算估计的项目数量
    const estimatedItemCount = Math.max(
      3,
      Math.round(
        (this.props.horizontal
          ? renderWindowSize.width
          : renderWindowSize.height) /
          (this.props.estimatedItemSize ?? this.defaultEstimatedItemSize)
      )
    );
    // 重新初始化平均窗口对象
    this.averageWindow = new AverageWindow(
      2 * (this.props.numColumns || 1) * estimatedItemCount,
      this.averageWindow.currentValue
    );
    // 调用父类的方法创建新的布局管理器，并调整渲染窗口大小
    const newLayoutManager = super.newLayoutManager(
      this.getAdjustedRenderWindowSize(renderWindowSize),
      isHorizontal,
      cachedLayouts
    );
    if (cachedLayouts) {
      // 更新缓存布局的尺寸
      this.updateCachedDimensions(cachedLayouts, newLayoutManager);
    }
    return newLayoutManager;
  }

  /**
   * 更新缓存布局的尺寸。
   * 帮助更新布局的固定维度，例如水平列表中的宽度。
   * 提前更新这些维度可以确保布局管理器不会尝试在同一行或列中放入更多项目。
   * @param cachedLayouts - 缓存的布局数组。
   * @param layoutManager - 布局管理器实例。
   */
  private updateCachedDimensions(
    cachedLayouts: Layout[],
    layoutManager: LayoutManager
  ) {
    const layoutCount = cachedLayouts.length;
    for (let i = 0; i < layoutCount; i++) {
      cachedLayouts[i] = {
        ...cachedLayouts[i],
        // helps in updating the fixed dimension of layouts e.g, width in case of horizontal list
        // updating them in advance will make sure layout manager won't try to fit more items in the same row or column
        // 帮助更新布局的固定维度，例如水平列表中的宽度
        // 提前更新这些维度可以确保布局管理器不会尝试在同一行或列中放入更多项目
        ...layoutManager.getStyleOverridesForIndex(i),
      };
    }
  }

  /**
   * 获取一个干净的布局对象，重置其跨度和大小属性。
   * @returns 重置后的布局对象。
   */
  private getCleanLayoutObj() {
    this.layoutObject.size = undefined;
    this.layoutObject.span = undefined;
    return this.layoutObject;
  }

  /**
   * 调整渲染窗口的大小，应用内容容器的边距。
   * @param renderWindowSize - 原始的渲染窗口大小。
   * @returns 调整后的渲染窗口大小。
   */
  private getAdjustedRenderWindowSize(renderWindowSize: Dimension) {
    return applyContentContainerInsetForLayoutManager(
      { ...renderWindowSize },
      this.props.contentContainerStyle,
      Boolean(this.props.horizontal)
    );
  }
}
