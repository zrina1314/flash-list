import React from "react";
import {
  View,
  RefreshControl,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  StyleSheet,
  NativeScrollEvent,
} from "react-native";
// 从 recyclerlistview 库中导入必要的组件和类型
import {
  BaseItemAnimator,
  DataProvider,
  ProgressiveListView,
  RecyclerListView,
  RecyclerListViewProps,
  WindowCorrectionConfig,
} from "recyclerlistview";
// 从 recyclerlistview/sticky 导入粘性容器相关组件和类型
import StickyContainer, { StickyContainerProps } from "recyclerlistview/sticky";

// 导入自定义的自动布局视图组件
import AutoLayoutView from "./native/auto-layout/AutoLayoutView";
// 导入自定义的单元格容器组件
import CellContainer from "./native/cell-container/CellContainer";
// 导入纯组件包装器
import { PureComponentWrapper } from "./PureComponentWrapper";
// 导入带有属性的网格布局提供器
import GridLayoutProviderWithProps from "./GridLayoutProviderWithProps";
// 导入自定义错误类
import CustomError from "./errors/CustomError";
// 导入异常列表
import ExceptionList from "./errors/ExceptionList";
// 导入警告列表
import WarningList from "./errors/Warnings";
// 导入可见性管理器
import ViewabilityManager from "./viewability/ViewabilityManager";
// 导入 FlashList 的属性类型和渲染目标类型
import {
  FlashListProps,
  RenderTarget,
  RenderTargetOptions,
} from "./FlashListProps";
// 导入平台帮助工具相关的函数和配置
import {
  getCellContainerPlatformStyles,
  getFooterContainer,
  getItemAnimator,
  PlatformConfig,
} from "./native/config/PlatformHelper";
// 导入内容样式类型和获取内容容器内边距的函数
import {
  ContentStyleExplicit,
  getContentContainerPadding,
} from "./utils/ContentContainerUtils";

// 导入内容容器工具中的函数
import {
  hasUnsupportedKeysInContentContainerStyle,
  updateContentStyle,
} from "./utils/ContentContainerUtils";

/**
 * 粘性组件的属性接口，继承自 StickyContainerProps 并添加了 children 属性
 */
interface StickyProps extends StickyContainerProps {
  children: any;
}

/**
 * 将 StickyContainer 转换为具有 StickyProps 类型的 React 组件类
 */
const StickyHeaderContainer =
  StickyContainer as React.ComponentClass<StickyProps>;

/**
 * FlashList 的状态接口，包含数据提供者、列数、布局提供者等属性
 * @template T 数据项的类型
 */
export interface FlashListState<T> {
  dataProvider: DataProvider; // 数据提供者
  numColumns: number; // 列数
  layoutProvider: GridLayoutProviderWithProps<T>; // 布局提供者
  data?: ReadonlyArray<T> | null; // 数据数组
  extraData?: ExtraData<unknown>; // 额外数据
  renderItem?: FlashListProps<T>["renderItem"]; // 渲染项的函数
}

/**
 * 额外数据的接口，包含一个可选的值
 * @template T 额外数据的值的类型
 */
interface ExtraData<T> {
  value?: T;
}

/**
 * FlashList 组件类，继承自 React.PureComponent
 * @template T 数据项的类型
 */
class FlashList<T> extends React.PureComponent<
  FlashListProps<T>,
  FlashListState<T>
> {
  private rlvRef?: RecyclerListView<RecyclerListViewProps, any>; // RecyclerListView 的引用
  private stickyContentContainerRef?: PureComponentWrapper; // 粘性内容容器的引用
  private listFixedDimensionSize = 0; // 列表固定维度的大小
  private transformStyle = PlatformConfig.invertedTransformStyle; // 转换样式
  private transformStyleHorizontal =
    PlatformConfig.invertedTransformStyleHorizontal; // 水平转换样式

  private distanceFromWindow = 0; // 距离窗口的距离
  private contentStyle: ContentStyleExplicit = {
    // 内容样式
    paddingBottom: 0,
    paddingTop: 0,
    paddingLeft: 0,
    paddingRight: 0,
  };

  private loadStartTime = 0; // 加载开始时间
  private isListLoaded = false; // 列表是否加载完成
  private windowCorrectionConfig: WindowCorrectionConfig = {
    // 窗口校正配置
    value: {
      windowShift: 0,
      startCorrection: 0,
      endCorrection: 0,
    },
    applyToItemScroll: true,
    applyToInitialOffset: true,
  };

  private postLoadTimeoutId?: ReturnType<typeof setTimeout>; // 加载后超时 ID
  private itemSizeWarningTimeoutId?: ReturnType<typeof setTimeout>; // 项大小警告超时 ID
  private renderedSizeWarningTimeoutId?: ReturnType<typeof setTimeout>; // 渲染大小警告超时 ID

  private isEmptyList = false; // 列表是否为空
  private viewabilityManager: ViewabilityManager<T>; // 可见性管理器

  private itemAnimator?: BaseItemAnimator; // 项动画器

  // 默认属性
  static defaultProps = {
    data: [],
    numColumns: 1,
  };

  /**
   * 构造函数，初始化组件状态和属性
   * @param props 组件的属性
   */
  constructor(props: FlashListProps<T>) {
    super(props);
    this.loadStartTime = Date.now(); // 记录加载开始时间
    this.validateProps(); // 验证属性

    // 根据 estimatedListSize 设置列表固定维度大小
    if (props.estimatedListSize) {
      if (props.horizontal) {
        this.listFixedDimensionSize = props.estimatedListSize.height;
      } else {
        this.listFixedDimensionSize = props.estimatedListSize.width;
      }
    }

    // 设置距离窗口的距离
    this.distanceFromWindow =
      props.estimatedFirstItemOffset ?? ((props.ListHeaderComponent && 1) || 0);

    // 初始化状态
    this.state = FlashList.getInitialMutableState(this);
    this.viewabilityManager = new ViewabilityManager(this); // 初始化可见性管理器
    this.itemAnimator = getItemAnimator(); // 获取项动画器
  }

  /**
   * 验证组件属性的有效性
   */
  private validateProps() {
    // 检查 onRefresh 和 refreshing 属性的有效性
    if (this.props.onRefresh && typeof this.props.refreshing !== "boolean") {
      throw new CustomError(ExceptionList.refreshBooleanMissing);
    }

    // 检查粘性头部在水平列表中的支持情况
    if (
      Number(this.props.stickyHeaderIndices?.length) > 0 &&
      this.props.horizontal
    ) {
      throw new CustomError(ExceptionList.stickyWhileHorizontalNotSupported);
    }

    // 检查多列在水平列表中的支持情况
    if (Number(this.props.numColumns) > 1 && this.props.horizontal) {
      throw new CustomError(ExceptionList.columnsWhileHorizontalNotSupported);
    }

    // `createAnimatedComponent` always passes a blank style object. To avoid warning while using AnimatedFlashList we've modified the check
    // `style` prop can be an array. So we need to validate every object in array. Check: https://github.com/Shopify/flash-list/issues/651
    // 在开发环境中检查 style 属性是否支持
    if (
      __DEV__ &&
      Object.keys(StyleSheet.flatten(this.props.style ?? {})).length > 0
    ) {
      console.warn(WarningList.styleUnsupported);
    }

    // 检查内容容器样式是否包含不支持的键
    if (
      hasUnsupportedKeysInContentContainerStyle(
        this.props.contentContainerStyle
      )
    ) {
      console.warn(WarningList.styleContentContainerUnsupported);
    }
  }

  /**
   * 根据新的属性更新组件状态
   * @param nextProps 新的属性
   * @param prevState 之前的状态
   * @returns 更新后的状态
   */
  static getDerivedStateFromProps<T>(
    nextProps: Readonly<FlashListProps<T>>,
    prevState: FlashListState<T>
  ): FlashListState<T> {
    const newState = { ...prevState };

    // 如果列数发生变化，更新布局提供者
    if (prevState.numColumns !== nextProps.numColumns) {
      newState.numColumns = nextProps.numColumns || 1;
      newState.layoutProvider = FlashList.getLayoutProvider<T>(
        newState.numColumns,
        nextProps
      );
    } else if (prevState.layoutProvider.updateProps(nextProps).hasExpired) {
      // 如果布局提供者的属性过期，更新布局提供者
      newState.layoutProvider = FlashList.getLayoutProvider<T>(
        newState.numColumns,
        nextProps
      );
    }

    // RLV retries to reposition the first visible item on layout provider change.
    // It's not required in our case so we're disabling it
    // 设置布局提供者是否需要重新定位第一个可见项
    newState.layoutProvider.shouldRefreshWithAnchoring = Boolean(
      !prevState.layoutProvider?.hasExpired
    );

    // 如果数据发生变化，更新数据提供者和状态
    if (nextProps.data !== prevState.data) {
      newState.data = nextProps.data;
      newState.dataProvider = prevState.dataProvider.cloneWithRows(
        nextProps.data as any[]
      );
      if (nextProps.renderItem !== prevState.renderItem) {
        newState.extraData = { ...prevState.extraData };
      }
    }

    // 如果额外数据发生变化，更新状态
    if (nextProps.extraData !== prevState.extraData?.value) {
      newState.extraData = { value: nextProps.extraData };
    }

    // 更新渲染项的函数
    newState.renderItem = nextProps.renderItem;
    return newState;
  }

  /**
   * 获取初始的可变状态
   * @param flashList FlashList 组件实例
   * @returns 初始的可变状态
   */
  private static getInitialMutableState<T>(
    flashList: FlashList<T>
  ): FlashListState<T> {
    let getStableId: ((index: number) => string) | undefined;

    // 如果提供了 keyExtractor 函数，设置获取稳定 ID 的函数
    if (
      flashList.props.keyExtractor !== null &&
      flashList.props.keyExtractor !== undefined
    ) {
      getStableId = (index) =>
        // We assume `keyExtractor` function will never change from being `null | undefined` to defined and vice versa.
        // Similarly, data should never be `null | undefined` when `getStableId` is called.
        // 假设 keyExtractor 函数不会从 null | undefined 变为定义，反之亦然
        // 同样，当调用 getStableId 时，数据不应为 null | undefined
        flashList.props.keyExtractor!(
          flashList.props.data![index],
          index
        ).toString();
    }

    return {
      data: null,
      layoutProvider: null!!,
      dataProvider: new DataProvider((r1, r2) => {
        return r1 !== r2;
      }, getStableId),
      numColumns: 0,
    };
  }

  // Using only grid layout provider as it can also act as a listview, sizeProvider is a function to support future overrides
  /**
   * 获取布局提供者
   * @param numColumns 列数
   * @param flashListProps FlashList 的属性
   * @returns 布局提供者实例
   */
  private static getLayoutProvider<T>(
    numColumns: number,
    flashListProps: FlashListProps<T>
  ) {
    return new GridLayoutProviderWithProps<T>(
      // max span or, total columns
      // 最大跨度或总列数
      numColumns,
      (index, props) => {
        // type of the item for given index
        // 给定索引的项的类型
        const type = props.getItemType?.(
          props.data!![index],
          index,
          props.extraData
        );
        return type || 0;
      },
      (index, props, mutableLayout) => {
        // span of the item at given index, item can choose to span more than one column
        // 给定索引的项的跨度，项可以选择跨越多列
        props.overrideItemLayout?.(
          mutableLayout,
          props.data!![index],
          index,
          numColumns,
          props.extraData
        );
        return mutableLayout?.span ?? 1;
      },
      (index, props, mutableLayout) => {
        // estimated size of the item an given index
        // 给定索引的项的估计大小
        props.overrideItemLayout?.(
          mutableLayout,
          props.data!![index],
          index,
          numColumns,
          props.extraData
        );
        return mutableLayout?.size;
      },
      flashListProps
    );
  }

  /**
   * 列表滚动到底部时的回调函数
   */
  private onEndReached = () => {
    this.props.onEndReached?.();
  };

  /**
   * 获取刷新控件
   * @returns 刷新控件组件
   */
  private getRefreshControl = () => {
    if (this.props.onRefresh) {
      return (
        <RefreshControl
          refreshing={Boolean(this.props.refreshing)}
          progressViewOffset={this.props.progressViewOffset}
          onRefresh={this.props.onRefresh}
        />
      );
    }
  };

  /**
   * 组件挂载完成后的生命周期方法
   */
  componentDidMount() {
    // 如果数据为空，触发加载事件
    if (this.props.data?.length === 0) {
      this.raiseOnLoadEventIfNeeded();
    }
  }

  /**
   * 组件即将卸载时的生命周期方法
   */
  componentWillUnmount() {
    this.viewabilityManager.dispose(); // 销毁可见性管理器
    this.clearPostLoadTimeout(); // 清除加载后超时
    this.clearRenderSizeWarningTimeout(); // 清除渲染大小警告超时

    // 清除项大小警告超时
    if (this.itemSizeWarningTimeoutId !== undefined) {
      clearTimeout(this.itemSizeWarningTimeoutId);
    }
  }

  /**
   * 渲染组件
   * @returns 渲染的 JSX 元素
   */
  render() {
    this.isEmptyList = this.state.dataProvider.getSize() === 0; // 检查列表是否为空
    updateContentStyle(this.contentStyle, this.props.contentContainerStyle); // 更新内容样式

    // 解构赋值获取组件属性
    const {
      drawDistance,
      removeClippedSubviews,
      stickyHeaderIndices,
      horizontal,
      onEndReachedThreshold,
      estimatedListSize,
      initialScrollIndex,
      style,
      contentContainerStyle,
      renderScrollComponent,
      ...restProps
    } = this.props;

    // RecyclerListView simply ignores if initialScrollIndex is set to 0 because it doesn't understand headers
    // Using initialOffset to force RLV to scroll to the right place
    // 计算初始偏移量
    const initialOffset =
      (this.isInitialScrollIndexInFirstRow() && this.distanceFromWindow) ||
      undefined;

    // 计算最终绘制距离
    const finalDrawDistance =
      drawDistance === undefined
        ? PlatformConfig.defaultDrawDistance
        : drawDistance;

    return (
      <StickyHeaderContainer
        overrideRowRenderer={this.stickyOverrideRowRenderer}
        applyWindowCorrection={this.applyWindowCorrection}
        stickyHeaderIndices={stickyHeaderIndices}
        style={
          this.props.horizontal
            ? {
                ...this.getTransform(),
                ...this.props.stickyContentContainerStyle,
              }
            : {
                flex: 1,
                overflow: "hidden",
                ...this.getTransform(),
                ...this.props.stickyContentContainerStyle,
              }
        }
      >
        <ProgressiveListView
          {...restProps}
          ref={this.recyclerRef}
          layoutProvider={this.state.layoutProvider}
          dataProvider={this.state.dataProvider}
          rowRenderer={this.emptyRowRenderer}
          canChangeSize
          isHorizontal={Boolean(horizontal)}
          scrollViewProps={{
            onScrollBeginDrag: this.onScrollBeginDrag,
            onLayout: this.handleSizeChange,
            refreshControl:
              this.props.refreshControl || this.getRefreshControl(),

            // Min values are being used to suppress RLV's bounded exception
            // 最小尺寸用于抑制 RLV 的边界异常
            style: { minHeight: 1, minWidth: 1 },
            contentContainerStyle: {
              backgroundColor: this.contentStyle.backgroundColor,

              // Required to handle a scrollview bug. Check: https://github.com/Shopify/flash-list/pull/187
              // 处理 ScrollView 错误所需。检查：https://github.com/Shopify/flash-list/pull/187
              minHeight: 1,
              minWidth: 1,

              ...getContentContainerPadding(this.contentStyle, horizontal),
            },
            ...this.props.overrideProps,
          }}
          forceNonDeterministicRendering
          renderItemContainer={this.itemContainer}
          renderContentContainer={this.container}
          onEndReached={this.onEndReached}
          onEndReachedThresholdRelative={onEndReachedThreshold || undefined}
          extendedState={this.state.extraData}
          layoutSize={estimatedListSize}
          maxRenderAhead={3 * finalDrawDistance}
          finalRenderAheadOffset={finalDrawDistance}
          renderAheadStep={finalDrawDistance}
          initialRenderIndex={
            (!this.isInitialScrollIndexInFirstRow() && initialScrollIndex) ||
            undefined
          }
          initialOffset={initialOffset}
          onItemLayout={this.onItemLayout}
          onScroll={this.onScroll}
          onVisibleIndicesChanged={
            this.viewabilityManager.shouldListenToVisibleIndices
              ? this.viewabilityManager.onVisibleIndicesChanged
              : undefined
          }
          windowCorrectionConfig={this.getUpdatedWindowCorrectionConfig()}
          itemAnimator={this.itemAnimator}
          suppressBoundedSizeException
          externalScrollView={
            renderScrollComponent as RecyclerListViewProps["externalScrollView"]
          }
        />
      </StickyHeaderContainer>
    );
  }

  /**
   * 滚动开始拖动时的回调函数
   * @param event 滚动开始拖动事件
   */
  private onScrollBeginDrag = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    this.recordInteraction(); // 记录交互
    this.props.onScrollBeginDrag?.(event); // 调用父组件的回调函数
  };

  /**
   * 滚动时的回调函数
   * @param event 滚动事件
   */
  private onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    this.recordInteraction(); // 记录交互
    this.viewabilityManager.updateViewableItems(); // 更新可见项
    this.props.onScroll?.(event); // 调用父组件的回调函数
  };

  /**
   * 获取更新后的窗口校正配置
   * @returns 更新后的窗口校正配置
   */
  private getUpdatedWindowCorrectionConfig() {
    // If the initial scroll index is in the first row then we're forcing RLV to use initialOffset and thus we need to disable window correction
    // This isn't clean but it's the only way to get RLV to scroll to the right place
    // TODO: Remove this when RLV fixes this. Current implementation will also fail if column span is overridden in the first row.
    // 如果初始滚动索引在第一行，则禁用初始偏移量的窗口校正
    if (this.isInitialScrollIndexInFirstRow()) {
      this.windowCorrectionConfig.applyToInitialOffset = false;
    } else {
      this.windowCorrectionConfig.applyToInitialOffset = true;
    }

    // 设置窗口偏移量
    this.windowCorrectionConfig.value.windowShift = -this.distanceFromWindow;
    return this.windowCorrectionConfig;
  }

  /**
   * 检查初始滚动索引是否在第一行
   * @returns 如果初始滚动索引在第一行返回 true，否则返回 false
   */
  private isInitialScrollIndexInFirstRow() {
    return (
      (this.props.initialScrollIndex ?? this.state.numColumns) <
      this.state.numColumns
    );
  }

  /**
   * 验证列表大小
   * @param event 布局更改事件
   */
  private validateListSize(event: LayoutChangeEvent) {
    const { height, width } = event.nativeEvent.layout;
    this.clearRenderSizeWarningTimeout(); // 清除渲染大小警告超时

    // 如果列表大小过小，设置渲染大小警告超时
    if (Math.floor(height) <= 1 || Math.floor(width) <= 1) {
      this.renderedSizeWarningTimeoutId = setTimeout(() => {
        console.warn(WarningList.unusableRenderedSize);
      }, 1000);
    }
  }

  /**
   * 处理列表大小变化的回调函数
   * @param event 布局更改事件
   */
  private handleSizeChange = (event: LayoutChangeEvent) => {
    this.validateListSize(event); // 验证列表大小

    // 获取新的列表大小
    const newSize = this.props.horizontal
      ? event.nativeEvent.layout.height
      : event.nativeEvent.layout.width;
    const oldSize = this.listFixedDimensionSize;
    this.listFixedDimensionSize = newSize;

    // >0 check is to avoid rerender on mount where it would be redundant
    // 如果列表大小发生变化，强制重新渲染
    if (oldSize > 0 && oldSize !== newSize) {
      this.rlvRef?.forceRerender();
    }

    // 调用父组件的 onLayout 回调函数
    if (this.props.onLayout) {
      this.props.onLayout(event);
    }
  };

  /**
   * 渲染列表容器
   * @param props 容器属性
   * @param children 子元素
   * @returns 渲染的 JSX 元素
   */
  private container = (props: object, children: React.ReactNode[]) => {
    this.clearPostLoadTimeout(); // 清除加载后超时

    return (
      <>
        <PureComponentWrapper
          enabled={this.isListLoaded || children.length > 0 || this.isEmptyList}
          contentStyle={this.props.contentContainerStyle}
          horizontal={this.props.horizontal}
          header={this.props.ListHeaderComponent}
          extraData={this.state.extraData}
          headerStyle={this.props.ListHeaderComponentStyle}
          inverted={this.props.inverted}
          renderer={this.header}
        />
        <AutoLayoutView
          {...props}
          onBlankAreaEvent={this.props.onBlankArea}
          onLayout={this.updateDistanceFromWindow}
          disableAutoLayout={this.props.disableAutoLayout}
        >
          {children}
        </AutoLayoutView>
        {this.isEmptyList
          ? this.getValidComponent(this.props.ListEmptyComponent)
          : null}
        <PureComponentWrapper
          enabled={this.isListLoaded || children.length > 0 || this.isEmptyList}
          contentStyle={this.props.contentContainerStyle}
          horizontal={this.props.horizontal}
          header={this.props.ListFooterComponent}
          extraData={this.state.extraData}
          headerStyle={this.props.ListFooterComponentStyle}
          inverted={this.props.inverted}
          renderer={this.footer}
        />
        {this.getComponentForHeightMeasurement()}
      </>
    );
  };

  /**
   * 渲染列表项容器
   * @param props 项容器属性
   * @param parentProps 父组件属性
   * @returns 渲染的 JSX 元素
   */
  private itemContainer = (props: any, parentProps: any) => {
    const CellRendererComponent =
      this.props.CellRendererComponent ?? CellContainer;

    return (
      <CellRendererComponent
        {...props}
        style={{
          ...props.style,
          flexDirection: this.props.horizontal ? "row" : "column",
          alignItems: "stretch",
          ...this.getTransform(),
          ...getCellContainerPlatformStyles(this.props.inverted!!, parentProps),
        }}
        index={parentProps.index}
      >
        <PureComponentWrapper
          extendedState={parentProps.extendedState}
          internalSnapshot={parentProps.internalSnapshot}
          data={parentProps.data}
          arg={parentProps.index}
          renderer={this.getCellContainerChild}
        />
      </CellRendererComponent>
    );
  };

  /**
   * 更新距离窗口的距离
   * @param event 布局更改事件
   */
  private updateDistanceFromWindow = (event: LayoutChangeEvent) => {
    const newDistanceFromWindow = this.props.horizontal
      ? event.nativeEvent.layout.x
      : event.nativeEvent.layout.y;

    // 如果距离窗口的距离发生变化，更新相关配置
    if (this.distanceFromWindow !== newDistanceFromWindow) {
      this.distanceFromWindow = newDistanceFromWindow;
      this.windowCorrectionConfig.value.windowShift = -this.distanceFromWindow;
      this.viewabilityManager.updateViewableItems();
    }
  };

  /**
   * 获取转换样式
   * @returns 转换样式对象
   */
  private getTransform() {
    const transformStyle = this.props.horizontal
      ? this.transformStyleHorizontal
      : this.transformStyle;
    return (this.props.inverted && transformStyle) || undefined;
  }

  /**
   * 渲染分隔符
   * @param index 分隔符的索引
   * @returns 渲染的 JSX 元素
   */
  private separator = (index: number) => {
    // Make sure we have data and don't read out of bounds
    // 确保有数据且不越界
    if (
      this.props.data === null ||
      this.props.data === undefined ||
      index + 1 >= this.props.data.length
    ) {
      return null;
    }

    const leadingItem = this.props.data[index];
    const trailingItem = this.props.data[index + 1];

    const props = {
      leadingItem,
      trailingItem,
      // TODO: Missing sections as we don't have this feature implemented yet. Implement section, leadingSection and trailingSection.
      // TODO: 缺少 sections 功能，需要实现 section, leadingSection 和 trailingSection
      // https://github.com/facebook/react-native/blob/8bd3edec88148d0ab1f225d2119435681fbbba33/Libraries/Lists/VirtualizedSectionList.js#L285-L294
    };
    const Separator = this.props.ItemSeparatorComponent;
    return Separator && <Separator {...props} />;
  };

  /**
   * 渲染列表头部
   * @returns 渲染的 JSX 元素
   */
  private header = () => {
    return (
      <>
        <View
          style={{
            paddingTop: this.contentStyle.paddingTop,
            paddingLeft: this.contentStyle.paddingLeft,
          }}
        />
        <View
          style={[this.props.ListHeaderComponentStyle, this.getTransform()]}
        >
          {this.getValidComponent(this.props.ListHeaderComponent)}
        </View>
      </>
    );
  };

  /**
   * 渲染列表底部
   * @returns 渲染的 JSX 元素
   */
  private footer = () => {
    /** The web version of CellContainer uses a div directly which doesn't compose styles the way a View does.
     * We will skip using CellContainer on web to avoid this issue. `getFooterContainer` on web will
     * return a View. */
    /** Web 版本的 CellContainer 直接使用 div，其样式组合方式与 View 不同。
     * 为避免此问题，我们将跳过在 Web 上使用 CellContainer。`getFooterContainer` 在 Web 上
     * 将返回一个 View。 */
    const FooterContainer = getFooterContainer() ?? CellContainer;

    return (
      <>
        <FooterContainer
          index={-1}
          style={[this.props.ListFooterComponentStyle, this.getTransform()]}
        >
          {this.getValidComponent(this.props.ListFooterComponent)}
        </FooterContainer>
        <View
          style={{
            paddingBottom: this.contentStyle.paddingBottom,
            paddingRight: this.contentStyle.paddingRight,
          }}
        />
      </>
    );
  };

  /**
   * 获取用于测量高度的组件
   * @returns 渲染的 JSX 元素
   */
  private getComponentForHeightMeasurement = () => {
    return this.props.horizontal &&
      !this.props.disableHorizontalListHeightMeasurement &&
      !this.isListLoaded &&
      this.state.dataProvider.getSize() > 0 ? (
      <View style={{ opacity: 0 }} pointerEvents="none">
        {this.rowRendererWithIndex(
          Math.min(this.state.dataProvider.getSize() - 1, 1),
          RenderTargetOptions.Measurement
        )}
      </View>
    ) : null;
  };

  /**
   * 获取有效的组件
   * @param component 组件或元素
   * @returns 有效的组件或元素
   */
  private getValidComponent(
    component: React.ComponentType | React.ReactElement | null | undefined
  ) {
    const PassedComponent = component;
    return (
      (React.isValidElement(PassedComponent) && PassedComponent) ||
      (PassedComponent && <PassedComponent />) ||
      null
    );
  }

  /**
   * 应用窗口校正
   * @param _ 第一个参数（未使用）
   * @param __ 第二个参数（未使用）
   * @param correctionObject 校正对象
   */
  private applyWindowCorrection = (
    _: any,
    __: any,
    correctionObject: { windowShift: number }
  ) => {
    correctionObject.windowShift = -this.distanceFromWindow;
    this.stickyContentContainerRef?.setEnabled(this.isStickyEnabled);
  };

  /**
   * 渲染粘性头部行
   * @param index 行的索引
   * @returns 渲染的 JSX 元素
   */
  private rowRendererSticky = (index: number) => {
    return this.rowRendererWithIndex(index, RenderTargetOptions.StickyHeader);
  };

  /**
   * 根据索引和渲染目标渲染行
   * @param index 行的索引
   * @param target 渲染目标
   * @returns 渲染的 JSX 元素
   */
  private rowRendererWithIndex = (index: number, target: RenderTarget) => {
    // known issue: expected to pass separators which isn't available in RLV
    // 已知问题：预期传递分隔符，但 RLV 中不可用
    return this.props.renderItem?.({
      item: this.props.data![index],
      index,
      target,
      extraData: this.state.extraData?.value,
    }) as JSX.Element;
  };

  /**
   * This will prevent render item calls unless data changes.
   * Output of this method is received as children object so returning null here is no issue as long as we handle it inside our child container.
   * @module getCellContainerChild acts as the new rowRenderer and is called directly from our child container.
   * 空行渲染器，防止在数据未更改时调用渲染项
   * @returns null
   */
  private emptyRowRenderer = () => {
    return null;
  };

  /**
   * 获取单元格容器的子元素
   * @param index 单元格的索引
   * @returns 渲染的 JSX 元素
   */
  private getCellContainerChild = (index: number) => {
    return (
      <>
        {this.props.inverted ? this.separator(index) : null}
        <View
          style={{
            flexDirection:
              this.props.horizontal || this.props.numColumns === 1
                ? "column"
                : "row",
          }}
        >
          {this.rowRendererWithIndex(index, RenderTargetOptions.Cell)}
        </View>
        {this.props.inverted ? null : this.separator(index)}
      </>
    );
  };

  /**
   * 设置 RecyclerListView 的引用
   * @param ref RecyclerListView 的引用
   */
  private recyclerRef = (ref: any) => {
    this.rlvRef = ref;
  };

  /**
   * 设置粘性内容容器的引用
   * @param ref 粘性内容容器的引用
   */
  private stickyContentRef = (ref: any) => {
    this.stickyContentContainerRef = ref;
  };

  /**
   * 覆盖粘性行的渲染器
   * @param _ 第一个参数（未使用）
   * @param rowData 行数据
   * @param index 行的索引
   * @param ___ 第三个参数（未使用）
   * @returns 渲染的 JSX 元素
   */
  private stickyOverrideRowRenderer = (
    _: any,
    rowData: any,
    index: number,
    ___: any
  ) => {
    return (
      <PureComponentWrapper
        ref={this.stickyContentRef}
        enabled={this.isStickyEnabled}
        // We're passing rowData to ensure that sticky headers are updated when data changes
        // 传递 rowData 以确保在数据更改时更新粘性头部
        rowData={rowData}
        arg={index}
        renderer={this.rowRendererSticky}
      />
    );
  };

  /**
   * 判断是否启用粘性头部
   * @returns 如果启用粘性头部返回 true，否则返回 false
   */
  private get isStickyEnabled() {
    const currentOffset = this.rlvRef?.getCurrentScrollOffset() || 0;
    return currentOffset >= this.distanceFromWindow;
  }

  /**
   * 处理项布局变化的回调函数
   * @param index 项的索引
   */
  private onItemLayout = (index: number) => {
    // Informing the layout provider about change to an item's layout. It already knows the dimensions so there's not need to pass them.
    // 通知布局提供者项的布局发生变化
    this.state.layoutProvider.reportItemLayout(index);
    this.raiseOnLoadEventIfNeeded(); // 触发加载事件
  };

  /**
   * 如果需要，触发加载事件
   */
  private raiseOnLoadEventIfNeeded = () => {
    if (!this.isListLoaded) {
      this.isListLoaded = true;
      this.props.onLoad?.({
        elapsedTimeInMs: Date.now() - this.loadStartTime,
      });
      this.runAfterOnLoad(); // 加载完成后执行的操作
    }
  };

  /**
   * 加载完成后执行的操作
   */
  private runAfterOnLoad = () => {
    // 如果未提供 estimatedItemSize，设置项大小警告超时
    if (this.props.estimatedItemSize === undefined) {
      this.itemSizeWarningTimeoutId = setTimeout(() => {
        const averageItemSize = Math.floor(
          this.state.layoutProvider.averageItemSize
        );
        console.warn(
          WarningList.estimatedItemSizeMissingWarning.replace(
            "@size",
            averageItemSize.toString()
          )
        );
      }, 1000);
    }

    // 设置加载后超时，强制更新组件
    this.postLoadTimeoutId = setTimeout(() => {
      // This force update is required to remove dummy element rendered to measure horizontal list height when  the list doesn't update on its own.
      // In most cases this timeout will never be triggered because list usually updates atleast once and this timeout is cleared on update.
      // 此强制更新用于在列表不自动更新时移除用于测量水平列表高度的虚拟元素
      // 在大多数情况下，此超时不会触发，因为列表通常至少更新一次，并且在更新时会清除此超时
      if (this.props.horizontal) {
        this.forceUpdate();
      }
    }, 500);
  };

  /**
   * 清除加载后超时
   */
  private clearPostLoadTimeout = () => {
    if (this.postLoadTimeoutId !== undefined) {
      clearTimeout(this.postLoadTimeoutId);
      this.postLoadTimeoutId = undefined;
    }
  };

  /**
   * 清除渲染大小警告超时
   */
  private clearRenderSizeWarningTimeout = () => {
    if (this.renderedSizeWarningTimeoutId !== undefined) {
      clearTimeout(this.renderedSizeWarningTimeoutId);
      this.renderedSizeWarningTimeoutId = undefined;
    }
  };

  /**
   * Disables recycling for the next frame so that layout animations run well.
   * Warning: Avoid this when making large changes to the data as the list might draw too much to run animations. Single item insertions/deletions
   * should be good. With recycling paused the list cannot do much optimization.
   * The next render will run as normal and reuse items.
   * 为布局动画渲染做准备
   * 警告：在对数据进行大量更改时避免使用此方法，因为列表可能会绘制过多内容而无法运行动画。单项插入/删除应该没问题。
   * 暂停回收后，列表无法进行太多优化。下一次渲染将正常运行并重用项。
   */
  public prepareForLayoutAnimationRender(): void {
    // 检查是否提供了 keyExtractor 函数
    if (
      this.props.keyExtractor === null ||
      this.props.keyExtractor === undefined
    ) {
      console.warn(WarningList.missingKeyExtractor);
    } else {
      this.rlvRef?.prepareForLayoutAnimationRender();
    }
  }

  /**
   * 滚动到列表末尾
   * @param params 滚动参数，包含是否动画滚动
   */
  public scrollToEnd(params?: { animated?: boolean | null | undefined }) {
    this.rlvRef?.scrollToEnd(Boolean(params?.animated));
  }

  /**
   * 滚动到指定索引的项
   * @param params 滚动参数，包含是否动画滚动、索引、视图偏移量和视图位置
   */
  public scrollToIndex(params: {
    animated?: boolean | null | undefined;
    index: number;
    viewOffset?: number | undefined;
    viewPosition?: number | undefined;
  }) {
    const layout = this.rlvRef?.getLayout(params.index);
    const listSize = this.rlvRef?.getRenderedSize();

    if (layout && listSize) {
      const itemOffset = this.props.horizontal ? layout.x : layout.y;
      const fixedDimension = this.props.horizontal
        ? listSize.width
        : listSize.height;
      const itemSize = this.props.horizontal ? layout.width : layout.height;
      const scrollOffset =
        Math.max(
          0,
          itemOffset - (params.viewPosition ?? 0) * (fixedDimension - itemSize)
        ) - (params.viewOffset ?? 0);
      this.rlvRef?.scrollToOffset(
        scrollOffset,
        scrollOffset,
        Boolean(params.animated),
        true
      );
    }
  }

  /**
   * 滚动到指定项
   * @param params 滚动参数，包含是否动画滚动、项、视图位置和视图偏移量
   */
  public scrollToItem(params: {
    animated?: boolean | null | undefined;
    item: any;
    viewPosition?: number | undefined;
    viewOffset?: number | undefined;
  }) {
    const index = this.props.data?.indexOf(params.item) ?? -1;
    if (index >= 0) {
      this.scrollToIndex({ ...params, index });
    }
  }

  /**
   * 滚动到指定偏移量
   * @param params 滚动参数，包含是否动画滚动和偏移量
   */
  public scrollToOffset(params: {
    animated?: boolean | null | undefined;
    offset: number;
  }) {
    const x = this.props.horizontal ? params.offset : 0;
    const y = this.props.horizontal ? 0 : params.offset;
    this.rlvRef?.scrollToOffset(x, y, Boolean(params.animated));
  }

  /**
   * 获取可滚动节点的 ID
   * @returns 可滚动节点的 ID 或 null
   */
  public getScrollableNode(): number | null {
    return this.rlvRef?.getScrollableNode?.() || null;
  }

  /**
   * Allows access to internal recyclerlistview. This is useful for enabling access to its public APIs.
   * Warning: We may swap recyclerlistview for something else in the future. Use with caution.
   * 允许访问内部的 RecyclerListView
   * 警告：我们未来可能会将 RecyclerListView 替换为其他组件，请谨慎使用。
   */
  /* eslint-disable @typescript-eslint/naming-convention */
  public get recyclerlistview_unsafe() {
    return this.rlvRef;
  }

  /**
   * Specifies how far the first item is from top of the list. This would normally be a sum of header size and top/left padding applied to the list.
   * 获取第一个项距离列表顶部的距离
   * 这通常是列表头部大小和顶部/左侧内边距的总和
   */
  public get firstItemOffset() {
    return this.distanceFromWindow;
  }

  /**
   * FlashList will skip using layout cache on next update. Can be useful when you know the layout will change drastically for example, orientation change when used as a carousel.
   * FlashList 将在下一次更新时跳过使用布局缓存
   * 当你知道布局将发生重大变化时（例如，用作轮播时的方向更改），此方法可能有用。
   */
  public clearLayoutCacheOnUpdate() {
    this.state.layoutProvider.markExpired();
  }

  /**
   * Tells the list an interaction has occurred, which should trigger viewability calculations, e.g. if waitForInteractions is true and the user has not scrolled.
   * This is typically called by taps on items or by navigation actions.
   * 记录用户交互，触发可见性计算
   * 当 waitForInteractions 为 true 且用户未滚动时，此方法通常由项上的点击或导航操作调用。
   */
  public recordInteraction = () => {
    this.viewabilityManager.recordInteraction();
  };

  /**
   * Retriggers viewability calculations. Useful to imperatively trigger viewability calculations.
   * 重新计算可见项
   * 用于强制触发可见性计算。
   */
  public recomputeViewableItems = () => {
    this.viewabilityManager.recomputeViewableItems();
  };

  /**
   * Returns the dimensions of the child container.
   * @returns {Object} The dimensions of the child container.
   * 获取子容器的尺寸
   * @returns 子容器的尺寸对象
   */
  public getChildContainerDimensions() {
    return this.rlvRef?.getContentDimension();
  }

  /**
   * Returns the layout of the item at the given index.
   * @param index - The index of the item to get the layout for.
   * @returns {Object} The layout of the item at the given index.
   * 获取指定索引项的布局
   * @param index 项的索引
   * @returns 指定索引项的布局对象
   */
  public getLayout(index: number) {
    return this.rlvRef?.getLayout(index);
  }

  /**
   * Returns the size of the list.
   * @returns {Object} The size of the list.
   * 获取列表的大小
   * @returns 列表的大小对象
   */
  public getWindowSize() {
    return this.rlvRef?.getRenderedSize();
  }

  /**
   * Returns the absolute last scroll offset of the list.
   * @returns {number} The absolute last scroll offset of the list.
   * 获取列表的绝对最后滚动偏移量
   * @returns 列表的绝对最后滚动偏移量
   */
  public getAbsoluteLastScrollOffset() {
    return this.rlvRef?.getCurrentScrollOffset() ?? 0;
  }

  /**
   * Returns the first item offset of the list.
   * @returns {number} The first item offset of the list.
   * 获取列表的第一个项偏移量
   * @returns 列表的第一个项偏移量
   */
  public getFirstItemOffset() {
    return this.firstItemOffset;
  }

  /**
   * 获取第一个可见项的索引
   * @returns 第一个可见项的索引，如果没有则返回 -1
   */
  public getFirstVisibleIndex() {
    return this.rlvRef?.findApproxFirstVisibleIndex() ?? -1;
  }
}

// 导出 FlashList 组件
export default FlashList;
