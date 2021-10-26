const nextButtonElement = document.getElementById("next");
const backButtonElement = document.getElementById("back");
const subSelectElement = document.getElementById("sub");
const currentImageElement = document.getElementById("img");
const loadingImageElement = document.getElementById("loading");
const counterElement = document.getElementById("counter");

const LOADING_ERROR_URL =
  "https://jhusain.github.io/reddit-image-viewer/error.png";

const Observable = Rx.Observable;
// debugger;
// debugger;
// function which returns an array of image URLs for a given reddit sub
// getSubImages("pics") ->
// [
//   "https://upload.wikimedia.org/wikipedia/commons/3/36/Hopetoun_falls.jpg",
//   "https://upload.wikimedia.org/wikipedia/commons/3/38/4-Nature-Wallpapers-2014-1_ukaavUI.jpg",
//   ...
// ]
function getSubImages(sub) {
  const cachedImages = sessionStorage.getItem(sub);
  if (cachedImages) {
    return Observable.of(JSON.parse(cachedImages));
  } else {
    const subImagesRequestEndpoint = `https://www.reddit.com/r/${sub}/.json?limit=200&show=all`;

    // defer ensure new Observable (and therefore) promise gets created
    // for each subscription. This ensures functions like retry will
    // issue additional requests.
    return Observable.defer(() =>
      Observable.fromPromise(
        fetch(subImagesRequestEndpoint, {
          method: "GET",
        })
          .then((res) => res.json())
          .then((data) => {
            const images = data.data.children.map((image) => image.data.url);
            sessionStorage.setItem(sub, JSON.stringify(images)); // local cache
            return images;
          })
          .catch((e) => {
            throw Error(JSON.stringify(e));
          })
      )
    );
  }
}

// ---------------------- INSERT CODE  HERE ---------------------------
// This "images" Observable is a dummy. Replace it with a stream of each
// image in the current sub which is navigated by the user.

// user action streams
const backClick$ = Observable.fromEvent(backButtonElement, "click").share();
const nextClick$ = Observable.fromEvent(nextButtonElement, "click").share();
const subChange$ = Observable.fromEvent(subSelectElement, "change").share();
const subNameChange$ = Observable.concat(
  Observable.of(subSelectElement.value), // initial sub
  subChange$.map((e) => e.target.value)
);

// simple 1 to 1 listener
currentImageElement.onload = function () {
  loadingImageElement.style.visibility = "hidden";
};

/** Util to create an image preload observable */
const preloadImageUrl = (url) => {
  return (
    new Observable((observer) => {
      const tempPreloadImageElement = new Image();
      tempPreloadImageElement.onerror = (event) =>
        observer.error({ url, event, message: "image pre-load error" });

      tempPreloadImageElement.onload = function () {
        console.log("image pre-loaded", { url });
        observer.next(url);
        observer.complete();
      };

      // start image pre-loading
      tempPreloadImageElement.src = url;

      // unsubscription function
      const unsubscriber = () => {
        // stops image loading and removes listeners
        tempPreloadImageElement.onerror = null;
        tempPreloadImageElement.onload = null;
        tempPreloadImageElement.src = ""; // stops image loading in process
      };
      return unsubscriber;
    })
      // retry twice before actually throwing if loading failed
      .retry(2)
      // use fallback if it really failed to load
      .catch((error) => {
        console.error(error);
        return Observable.of(LOADING_ERROR_URL);
      })
  );
};

// observable that notifies whenever a user performs an action,
// like changing the sub or navigating the images
/** Stream of image navigation actions mapped to codes */
const navigationActionCode$ = Observable.merge(
  backClick$.map((e) => -1),
  nextClick$.map((e) => 1),
  subNameChange$.map((e) => 0)
  // todo add keyboard actions
);

/** API call to get image url array */
const imageListLoad$ = subNameChange$.switchMap((sub) => {
  // if getting the images fails, retries up to 3 times before actually throwing
  return getSubImages(sub).retry(3);
});

/** Stream of image changes, gets the latest value of each stream */
const currentImageChange$ = Observable.combineLatest(
  navigationActionCode$,
  imageListLoad$,
  subNameChange$
)
  .map(([actionCode, images, sub]) => {
    return { actionCode: actionCode, images, sub };
  })
  .scan(
    (oldAccumulatedState, newIncomingState) => {
      // from previous observable
      const { actionCode, images: newImages, sub: newSub } = newIncomingState;

      // from last return of this observable
      const {
        index: oldIndex,
        images: oldImages,
        sub: oldSub,
      } = oldAccumulatedState;

      const boundIndexToLimits = (newIndex) =>
        Math.min(Math.max(newIndex, 0), newImages.length - 1);

      // new index, if it is 0 then this means go to initial index
      const INITIAL_INDEX = 0;
      const newIndex =
        actionCode === 0
          ? INITIAL_INDEX
          : boundIndexToLimits(oldIndex + actionCode);

      const indexOrSubHasChanged = oldIndex !== newIndex || oldSub !== newSub;

      return {
        index: newIndex,
        sub: newSub,
        images: [...newImages],
        hasChange: indexOrSubHasChanged,
      };
    },
    {
      index: undefined,
      images: undefined,
      hasChange: undefined,
      sub: undefined,
      navigationVal: 0,
    }
  )
  // filter out events that don't change anything
  .filter(({ hasChange }) => hasChange)
  // show loader and update counter when there is definitely a change incoming
  .do(({ index, images }) => {
    counterElement.innerText = `${index + 1}/${images.length}`;
    loadingImageElement.style.visibility = "visible";
  })
  // pass along data and make sure image is preloaded
  .switchMap(({ index, images }) => {
    const url = images[index];
    return preloadImageUrl(url);
  })
  .do((url) => {
    // set the pre-loaded image url as the current image URL
    currentImageElement.src = url;
  });

currentImageChange$.subscribe({
  next(url) {
    console.log("changed image", { url });
  },
  error(e) {
    console.error("currentImageChange$ stream error", { error, e });
  },
});
