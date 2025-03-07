// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as chai from 'chai';
import * as sinon from 'sinon';

import NoOpAudioVideoController from '../../src/audiovideocontroller/NoOpAudioVideoController';
import AudioVideoObserver from '../../src/audiovideoobserver/AudioVideoObserver';
import ClientMetricReport from '../../src/clientmetricreport/ClientMetricReport';
import ClientMetricReportDirection from '../../src/clientmetricreport/ClientMetricReportDirection';
import ClientMetricReportMediaType from '../../src/clientmetricreport/ClientMetricReportMediaType';
import StreamMetricReport from '../../src/clientmetricreport/StreamMetricReport';
import NoOpDebugLogger from '../../src/logger/NoOpDebugLogger';
import MeetingSessionConfiguration from '../../src/meetingsession/MeetingSessionConfiguration';
import MeetingSessionLifecycleEvent from '../../src/meetingsession/MeetingSessionLifecycleEvent';
import MeetingSessionLifecycleEventCondition from '../../src/meetingsession/MeetingSessionLifecycleEventCondition';
import MeetingSessionStatus from '../../src/meetingsession/MeetingSessionStatus';
import MeetingSessionStatusCode from '../../src/meetingsession/MeetingSessionStatusCode';
import TimeoutScheduler from '../../src/scheduler/TimeoutScheduler';
import DefaultSignalingClient from '../../src/signalingclient/DefaultSignalingClient';
import AudioLogEvent from '../../src/statscollector/AudioLogEvent';
import StatsCollector from '../../src/statscollector/StatsCollector';
import VideoLogEvent from '../../src/statscollector/VideoLogEvent';
import DefaultVideoStreamIdSet from '../../src/videostreamidset/DefaultVideoStreamIdSet';
import DefaultVideoStreamIndex from '../../src/videostreamindex/DefaultVideoStreamIndex';
import DefaultWebSocketAdapter from '../../src/websocketadapter/DefaultWebSocketAdapter';
import DOMMockBehavior from '../dommock/DOMMockBehavior';
import DOMMockBuilder from '../dommock/DOMMockBuilder';

describe('StatsCollector', () => {
  class TestAudioVideoController extends NoOpAudioVideoController {
    testPeer: RTCPeerConnection = new RTCPeerConnection();

    get rtcPeerConnection(): RTCPeerConnection | null {
      return this.testPeer;
    }
  }

  const expect: Chai.ExpectStatic = chai.expect;
  const eventNamePrefix = 'meeting';
  const interval = 10;
  const CLIENT_TYPE = 'amazon-chime-sdk-js';

  let logger: NoOpDebugLogger;
  let domMockBehavior = new DOMMockBehavior();
  let domMockBuilder: DOMMockBuilder;
  let signalingClient: DefaultSignalingClient;
  let audioVideoController: NoOpAudioVideoController;
  let statsCollector: StatsCollector;
  let configuration: MeetingSessionConfiguration;

  beforeEach(() => {
    logger = new NoOpDebugLogger();
    domMockBehavior = new DOMMockBehavior();
    domMockBuilder = new DOMMockBuilder(domMockBehavior);
    signalingClient = new DefaultSignalingClient(new DefaultWebSocketAdapter(logger), logger);
    audioVideoController = new TestAudioVideoController();
    statsCollector = new StatsCollector(audioVideoController, logger, interval);
    configuration = new TestAudioVideoController().configuration;
  });

  afterEach(() => {
    domMockBuilder.cleanup();
  });

  describe('toAttribute', () => {
    it('does not convert if the input is in lower case', () => {
      expect(statsCollector.toAttribute('lower_case')).to.equal('lower_case');
    });

    it('converts the input to lower case', () => {
      expect(statsCollector.toAttribute('UPPER_CASE')).to.equal('upper_case');
    });

    it('converts CamelCase to snake_case', () => {
      expect(statsCollector.toAttribute('CamelCaseWithCAPS')).to.equal('camel_case_with_caps');
    });
  });

  describe('logLatency', () => {
    let logEventTimeAttributes: { [id: string]: string };

    beforeEach(() => {
      statsCollector = new StatsCollector(audioVideoController, logger, interval);
      logEventTimeAttributes = {
        call_id: configuration.meetingId,
        client_type: CLIENT_TYPE,
        metric_type: 'latency',
      };
    });

    it('logs the latency', () => {
      const eventName = 'ping_pong';
      const timeMs = 100;
      const attributes = { attr1: 'value1' };
      const spy = sinon.spy(statsCollector, 'metricsAddTime');
      statsCollector.logLatency(eventName, timeMs, attributes);
      expect(
        spy.calledOnceWith(`${eventNamePrefix}_${eventName}`, timeMs, {
          ...logEventTimeAttributes,
          ...attributes,
        })
      ).to.be.true;
    });

    it('logs the latency without attributes', () => {
      const eventName = 'ping_pong';
      const timeMs = 100;
      const spy = sinon.spy(statsCollector, 'metricsAddTime');
      statsCollector.logLatency(eventName, timeMs);
      expect(spy.calledOnceWith(`${eventNamePrefix}_${eventName}`, timeMs, logEventTimeAttributes))
        .to.be.true;
    });
  });

  describe('logging event', () => {
    let logEventAttributes: { [id: string]: string };

    beforeEach(() => {
      statsCollector = new StatsCollector(audioVideoController, logger, interval);
      logEventAttributes = {
        call_id: configuration.meetingId,
        client_type: CLIENT_TYPE,
      };
    });

    describe('logStateTimeout', () => {
      it('logs the state timeout', () => {
        const stateName = 'stopped';
        const attributes = { attr1: 'value1' };
        const spy = sinon.spy(statsCollector, 'metricsLogEvent');
        statsCollector.logStateTimeout(stateName, attributes);
        expect(
          spy.calledOnceWith('meeting_session_state_timeout', {
            ...logEventAttributes,
            ...attributes,
            state: `state_${stateName}`,
          })
        ).to.be.true;
      });
    });

    describe('logAudioEvent', () => {
      it('logs the audio event', () => {
        const event = AudioLogEvent.DeviceChanged;
        const attributes = { attr1: 'value1' };
        const spy = sinon.spy(statsCollector, 'metricsLogEvent');
        statsCollector.logAudioEvent(event, attributes);
        expect(
          spy.calledOnceWith(`audio_device_changed`, {
            ...logEventAttributes,
            ...attributes,
          })
        ).to.be.true;
      });
    });

    describe('logVideoEvent', () => {
      it('logs the video event', () => {
        const event = VideoLogEvent.InputAttached;
        const attributes = { attr1: 'value1' };
        const spy = sinon.spy(statsCollector, 'metricsLogEvent');
        statsCollector.logVideoEvent(event, attributes);
        expect(
          spy.calledOnceWith(`video_input_attached`, {
            ...logEventAttributes,
            ...attributes,
          })
        ).to.be.true;
      });
    });

    describe('logMeetingSessionStatus', () => {
      it('logs the meeting session status', () => {
        const status = new MeetingSessionStatus(MeetingSessionStatusCode.OK);
        const attributes = {
          status: `${status.statusCode()}`,
          status_code: `${status.statusCode()}`,
        };
        const spy = sinon.spy(statsCollector, 'metricsLogEvent');
        statsCollector.logMeetingSessionStatus(status);
        expect(spy.calledWith(`${status.statusCode()}`, logEventAttributes)).to.be.true;
        expect(
          spy.calledWith(`meeting_session_status`, {
            ...logEventAttributes,
            ...attributes,
          })
        ).to.be.true;
      });

      it('logs the meeting session status with failure events', () => {
        const status = new MeetingSessionStatus(
          MeetingSessionStatusCode.AudioAuthenticationRejected
        );
        const attributes = {
          status: `${status.statusCode()}`,
          status_code: `${status.statusCode()}`,
        };
        const spy = sinon.spy(statsCollector, 'metricsLogEvent');
        statsCollector.logMeetingSessionStatus(status);
        expect(spy.calledWith(`${status.statusCode()}`, logEventAttributes)).to.be.true;
        [
          'meeting_session_status',
          'meeting_session_stopped',
          'meeting_session_audio_failed',
          'meeting_session_failed',
        ].forEach(eventName => {
          expect(
            spy.calledWith(eventName, {
              ...logEventAttributes,
              ...attributes,
            })
          ).to.be.true;
        });
      });
    });

    describe('logLifecycleEvent', () => {
      it('logs the lifecycle event', () => {
        const spy = sinon.spy(statsCollector, 'metricsLogEvent');
        statsCollector.logLifecycleEvent(
          MeetingSessionLifecycleEvent.Connecting,
          MeetingSessionLifecycleEventCondition.ConnectingNew
        );
        expect(spy.calledOnce).to.be.true;
      });
    });
  });

  describe('metrics', () => {
    beforeEach(() => {
      statsCollector = new StatsCollector(audioVideoController, logger, interval);
    });

    describe('Promise-based getStats', () => {
      it('starts and stops WebRTC metrics collection', done => {
        const spy = sinon.spy(audioVideoController.rtcPeerConnection, 'getStats');
        statsCollector = new StatsCollector(audioVideoController, logger, interval);
        statsCollector.start(signalingClient, new DefaultVideoStreamIndex(logger));
        new TimeoutScheduler(interval + 5).start(() => {
          statsCollector.stop();
          expect(spy.calledOnce).to.be.true;
          done();
        });
      });

      it('cannot get stats if the peer connection does not exist', done => {
        class TestObserver implements AudioVideoObserver {
          metricsDidReceive(_clientMetricReport: ClientMetricReport): void {
            done();
          }
        }
        class NoPeerAudioVideoController extends NoOpAudioVideoController {
          get rtcPeerConnection(): RTCPeerConnection | null {
            return null;
          }
        }
        audioVideoController = new NoPeerAudioVideoController();
        audioVideoController.addObserver(new TestObserver());
        statsCollector = new StatsCollector(audioVideoController, logger, interval);
        statsCollector.start(signalingClient, new DefaultVideoStreamIndex(logger));
        new TimeoutScheduler(interval + 5).start(() => {
          statsCollector.stop();
          done();
        });
      });

      it('fails to get stats from the peer connection', done => {
        let errorMessage: string;
        class TestLogger extends NoOpDebugLogger {
          error(msg: string): void {
            errorMessage = msg;
          }
        }
        statsCollector = new StatsCollector(audioVideoController, new TestLogger(), interval);

        domMockBehavior.rtcPeerConnectionGetStatsSucceeds = false;
        const spy = sinon.spy(audioVideoController.rtcPeerConnection, 'getStats');
        statsCollector.start(signalingClient, new DefaultVideoStreamIndex(logger));
        new TimeoutScheduler(interval + 5).start(() => {
          statsCollector.stop();
          expect(spy.calledOnce).to.be.true;
          expect(errorMessage.includes('Failed to getStats')).to.be.true;
          done();
        });
      });

      it('uses the default interval and cannot start more than once', () => {
        statsCollector = new StatsCollector(audioVideoController, logger);
        expect(statsCollector.start(signalingClient, new DefaultVideoStreamIndex(logger))).to.be
          .true;
        expect(statsCollector.start(signalingClient, new DefaultVideoStreamIndex(logger))).to.be
          .false;
        statsCollector.stop();
      });

      it('notifies observers', done => {
        class TestObserver implements AudioVideoObserver {
          metricsDidReceive(_clientMetricReport: ClientMetricReport): void {
            statsCollector.stop();
            done();
          }
        }
        audioVideoController.addObserver(new TestObserver());
        statsCollector = new StatsCollector(audioVideoController, logger, interval);
        statsCollector.start(signalingClient, new DefaultVideoStreamIndex(logger));
      });
    });
  });

  describe('validators', () => {
    describe('isValidRawMetricReport', () => {
      it('checks type of raw metric report', () => {
        statsCollector = new StatsCollector(audioVideoController, logger, interval);
        statsCollector.start(signalingClient, new DefaultVideoStreamIndex(logger));
        expect(
          statsCollector.isValidStandardRawMetric({
            type: 'candidate-pair',
            state: 'succeeded',
          })
        ).to.be.true;
        expect(
          statsCollector.isValidStandardRawMetric({
            type: 'inbound-rtp',
          })
        ).to.be.true;
        expect(
          statsCollector.isValidStandardRawMetric({
            type: 'outbound-rtp',
          })
        ).to.be.true;
        expect(
          statsCollector.isValidStandardRawMetric({
            type: 'remote-inbound-rtp',
          })
        ).to.be.true;
        expect(
          statsCollector.isValidStandardRawMetric({
            type: 'remote-outbound-rtp',
          })
        ).to.be.true;

        statsCollector.stop();
      });
    });

    describe('isValidSsrc', () => {
      it('checks valid ssrc', done => {
        class TestVideoStreamIndex extends DefaultVideoStreamIndex {
          streamIdForSSRC(_ssrcId: number): number {
            return 1;
          }
        }
        statsCollector = new StatsCollector(audioVideoController, logger, interval);
        statsCollector.start(signalingClient, new TestVideoStreamIndex(logger));
        new TimeoutScheduler(interval + 5).start(() => {
          statsCollector.stop();
          expect(
            statsCollector.isValidSsrc({
              type: 'inbound-rtp',
              id: 'id',
              kind: 'video',
            })
          ).to.be.true;
          expect(
            statsCollector.isValidSsrc({
              type: 'outbound-rtp',
              id: 'id',
              kind: 'video',
            })
          ).to.be.true;
          expect(
            statsCollector.isValidSsrc({
              type: 'inbound-rtp',
              id: 'id',
              kind: 'audio',
            })
          ).to.be.true;
          expect(
            statsCollector.isValidSsrc({
              type: 'outbound-rtp',
              id: 'outbound',
              kind: 'video',
            })
          ).to.be.true;
          done();
        });
      });

      it('checks invalid ssrc', done => {
        class TestVideoStreamIndex extends DefaultVideoStreamIndex {
          streamIdForSSRC(_ssrcId: number): number {
            return 0;
          }
        }
        statsCollector = new StatsCollector(audioVideoController, logger, interval);
        statsCollector.start(signalingClient, new TestVideoStreamIndex(logger));
        new TimeoutScheduler(interval + 5).start(() => {
          statsCollector.stop();
          expect(
            statsCollector.isValidSsrc({
              type: 'inbound-rtp',
              id: 'id',
              kind: 'video',
            })
          ).to.be.false;
          done();
        });
      });
    });

    describe('filterRawMetricReports', () => {
      it('filters out invalid reports', done => {
        statsCollector = new StatsCollector(audioVideoController, logger, interval);
        statsCollector.start(signalingClient, new DefaultVideoStreamIndex(logger));
        new TimeoutScheduler(interval + 5).start(() => {
          expect(
            statsCollector.filterRawMetricReports([
              {
                type: 'invalid-type',
              },
            ])
          ).to.deep.equal([]);
          statsCollector.stop();
          done();
        });
      });
    });
  });

  describe('protobuf packaging', () => {
    it('global metric report', done => {
      domMockBehavior.rtcPeerConnectionGetStatsReports = [
        {
          id: 'RTCIceCandidatePair',
          type: 'candidate-pair',
          state: 'succeeded',
          availableIncomingBitrate: 1000,
        },
      ];

      statsCollector.start(signalingClient, new DefaultVideoStreamIndex(logger));
      new TimeoutScheduler(interval + 5).start(() => {
        statsCollector.stop();
        done();
      });
    });

    it('stream metric report and videoStreamIndex has no stream', done => {
      domMockBehavior.rtcPeerConnectionGetStatsReports = [
        {
          id: 'RTCInboundRTPVideoStream',
          type: 'inbound-rtp',
          kind: 'video',
          packetsLost: 10,
        },
      ];

      statsCollector = new StatsCollector(audioVideoController, logger, interval);
      statsCollector.start(signalingClient, new DefaultVideoStreamIndex(logger));
      new TimeoutScheduler(interval + 5).start(() => {
        statsCollector.stop();
        done();
      });
    });

    it('stream metric report and videoStreamIndex has streams', done => {
      class TestVideoStreamIndex extends DefaultVideoStreamIndex {
        allStreams(): DefaultVideoStreamIdSet {
          return new DefaultVideoStreamIdSet([1, 2, 3]);
        }

        streamIdForSSRC(_ssrcId: number): number {
          return 1;
        }
      }
      domMockBehavior.rtcPeerConnectionGetStatsReports = [
        {
          id: 'RTCInboundRTPVideoStream',
          type: 'inbound-rtp',
          kind: 'video',
          packetsLost: 10,
          jitterBufferDelay: 100,
          decoderImplementation: 'FFmpeg',
        },
      ];

      statsCollector.start(signalingClient, new TestVideoStreamIndex(logger));

      new TimeoutScheduler(interval + 5).start(() => {
        statsCollector.stop();
        done();
      });
    });

    it('stream metric report and videoStreamIndex has streams and there are existing streamMetricReports', done => {
      class TestVideoStreamIndex extends DefaultVideoStreamIndex {
        allStreams(): DefaultVideoStreamIdSet {
          return new DefaultVideoStreamIdSet([1, 2, 3]);
        }

        streamIdForSSRC(_ssrcId: number): number {
          return 1;
        }
      }

      domMockBehavior.rtcPeerConnectionGetStatsReports = [
        {
          id: 'RTCInboundRTPVideoStream',
          type: 'inbound-rtp',
          kind: 'video',
          packetsLost: 10,
          jitterBufferDelay: 100,
          decoderImplementation: 'FFmpeg',
        },
      ];

      const streamMetricReport = new StreamMetricReport();
      streamMetricReport.streamId = 1;
      streamMetricReport.mediaType = ClientMetricReportMediaType.AUDIO;
      streamMetricReport.direction = ClientMetricReportDirection.UPSTREAM;
      streamMetricReport.currentMetrics['packetsLost'] = 10;
      streamMetricReport.currentMetrics['jitterBufferDelay'] = 100;
      streamMetricReport.currentStringMetrics['decoderImplementation'] = 'FFmpeg';
      streamMetricReport.currentStringMetrics['invalid-type'] = 'invalid-value';

      statsCollector = new StatsCollector(audioVideoController, logger, interval);
      statsCollector.start(signalingClient, new TestVideoStreamIndex(logger));

      // @ts-ignore
      statsCollector.clientMetricReport.streamMetricReports[1] = streamMetricReport;

      new TimeoutScheduler(interval + 5).start(() => {
        statsCollector.stop();
        done();
      });
    });

    it('adds the metric frame from the stream metric report when videoStreamIndex has streams', done => {
      class TestVideoStreamIndex extends DefaultVideoStreamIndex {
        allStreams(): DefaultVideoStreamIdSet {
          return new DefaultVideoStreamIdSet([1, 2, 3]);
        }

        streamIdForSSRC(_ssrcId: number): number {
          return 1;
        }
      }
      domMockBehavior.rtcPeerConnectionGetStatsReports = [
        {
          id: 'RTCInboundRTPVideoStream',
          type: 'inbound-rtp',
          kind: 'video',
          packetsLost: 10,
          jitterBufferDelay: 100,
        },
      ];

      statsCollector.start(signalingClient, new TestVideoStreamIndex(logger));

      new TimeoutScheduler(interval + 5).start(() => {
        statsCollector.stop();
        done();
      });
    });

    it('adds the metric frame from the stream metric report when videoStreamIndex has streams and value in null type', done => {
      class TestVideoStreamIndex extends DefaultVideoStreamIndex {
        allStreams(): DefaultVideoStreamIdSet {
          return new DefaultVideoStreamIdSet([1, 2, 3]);
        }

        streamIdForSSRC(_ssrcId: number): number {
          return 1;
        }
      }
      domMockBehavior.rtcPeerConnectionGetStatsReports = [
        {
          id: 'RTCInboundRTPVideoStream',
          type: 'inbound-rtp',
          kind: 'video',
          packetsLost: 10,
          jitterBufferDelay: 100,
          decoderImplementation: null,
        },
      ];

      statsCollector.start(signalingClient, new TestVideoStreamIndex(logger));

      new TimeoutScheduler(interval + 5).start(() => {
        statsCollector.stop();
        done();
      });
    });

    it('cannot add the metric frame if the type does not exist in the metric spec', done => {
      domMockBehavior.rtcPeerConnectionGetStatsReports = [
        {
          id: 'RTCIceCandidatePair',
          type: 'candidate-pair',
          state: 'succeeded',
          availableIncomingBitrate: 1000,
        },
      ];
      statsCollector.start(signalingClient, new DefaultVideoStreamIndex(logger));
      new TimeoutScheduler(interval + 5).start(() => {
        statsCollector.stop();
        done();
      });
    });

    it('updates the report using the video upstream metrics map', done => {
      domMockBehavior.rtcPeerConnectionGetStatsReports = [
        {
          id: 'RTCIceCandidatePair',
          type: 'candidate-pair',
          state: 'succeeded',
          roundTripTime: 10,
        },
      ];

      statsCollector = new StatsCollector(audioVideoController, logger, interval);
      statsCollector.start(signalingClient, new DefaultVideoStreamIndex(logger));
      new TimeoutScheduler(interval + 5).start(() => {
        statsCollector.stop();
        done();
      });
    });
  });

  describe('stop', () => {
    it('stops without an error even if it has not started', done => {
      const spy = sinon.spy(audioVideoController.rtcPeerConnection, 'getStats');
      statsCollector.start(signalingClient, new DefaultVideoStreamIndex(logger));
      statsCollector.stop();
      statsCollector.stop();
      new TimeoutScheduler(interval + 5).start(() => {
        expect(spy.calledOnce).to.be.false;
        done();
      });
    });
  });
});
